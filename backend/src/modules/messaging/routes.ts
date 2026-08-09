import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, param, created, cursorArgs, noContent, ok, toPage } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { notifyMany } from '../../services/notifications.js';

const router: Router = Router();

const sendSchema = z.object({
  body: z.string().trim().min(1, 'Write a message first.').max(4000),
  attachments: z.array(z.string().url()).max(6).default([]),
});

const pageSchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.use(requireAuth);

async function assertParticipant(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) throw forbidden('This conversation is not yours.');
  return participant;
}

/** Inbox — one row per conversation with the last message and unread count. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const conversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId: req.user!.id } } },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
      include: {
        order: { select: { id: true, code: true, status: true } },
        request: { select: { id: true, code: true } },
        participants: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const withUnread = await Promise.all(
      conversations.map(async (c) => {
        const me = c.participants.find((p) => p.userId === req.user!.id);
        const unread = await prisma.message.count({
          where: {
            conversationId: c.id,
            senderId: { not: req.user!.id },
            ...(me?.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
          },
        });
        return { ...c, unread };
      }),
    );

    return ok(res, withUnread);
  }),
);

router.get(
  '/:conversationId/messages',
  validate(pageSchema, 'query'),
  asyncHandler(async (req, res) => {
    await assertParticipant(param(req, 'conversationId'), req.user!.id);
    const query = req.query as unknown as z.infer<typeof pageSchema>;

    const rows = await prisma.message.findMany({
      where: { conversationId: param(req, 'conversationId') },
      orderBy: { createdAt: 'desc' },
      ...cursorArgs(query.cursor, query.limit),
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
    });

    return ok(res, toPage(rows, query.limit));
  }),
);

router.post(
  '/:conversationId/messages',
  validate(sendSchema),
  asyncHandler(async (req, res) => {
    const conversationId = param(req, 'conversationId');
    await assertParticipant(conversationId, req.user!.id);

    const message = await prisma.$transaction(async (tx) => {
      const created_ = await tx.message.create({
        data: {
          conversationId,
          senderId: req.user!.id,
          body: req.body.body,
          attachments: req.body.attachments,
        },
        include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });

      const others = await tx.conversationParticipant.findMany({
        where: { conversationId, userId: { not: req.user!.id }, isMuted: false },
        select: { userId: true },
      });

      await notifyMany(
        tx,
        others.map((o) => o.userId),
        {
          type: 'MESSAGE_RECEIVED',
          title: `New message from ${created_.sender.name ?? 'your designer'}`,
          body: req.body.body.slice(0, 140),
          linkUrl: `/app/messages?c=${conversationId}`,
          data: { conversationId },
        },
      );

      return created_;
    });

    return created(res, message);
  }),
);

router.post(
  '/:conversationId/read',
  asyncHandler(async (req, res) => {
    await assertParticipant(param(req, 'conversationId'), req.user!.id);
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: param(req, 'conversationId'), userId: req.user!.id } },
      data: { lastReadAt: new Date() },
    });
    return noContent(res);
  }),
);

/** Opens (or reuses) the pre-order thread between a customer and a designer. */
router.post(
  '/requests/:requestId/open',
  asyncHandler(async (req, res) => {
    const request = await prisma.designRequest.findUnique({
      where: { id: param(req, 'requestId') },
      select: { id: true, customerId: true, design: { select: { title: true } } },
    });
    if (!request) throw notFound('That request');

    const isCustomer = request.customerId === req.user!.id;
    const designerUserId = req.user!.designerId ? req.user!.id : null;
    if (!isCustomer && !designerUserId) throw forbidden('You cannot open this conversation.');

    const existing = await prisma.conversation.findFirst({
      where: {
        requestId: request.id,
        participants: { some: { userId: req.user!.id } },
      },
    });
    if (existing) return ok(res, existing);

    const conversation = await prisma.conversation.create({
      data: {
        type: 'DESIGN_REQUEST',
        requestId: request.id,
        subject: request.design.title,
        lastMessageAt: new Date(),
        participants: {
          create: [
            { userId: request.customerId },
            ...(req.user!.id !== request.customerId ? [{ userId: req.user!.id }] : []),
          ],
        },
      },
    });

    return created(res, conversation);
  }),
);

export default router;
