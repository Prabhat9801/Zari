import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, param, created, ok } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { conflict, notFound } from '../../lib/errors.js';
import { cursorArgs, toPage } from '../../lib/http.js';
import { aiClient, type DesignSpec } from '../../services/aiClient.js';
import { auditLog, notify } from '../../services/notifications.js';
import { recomputeQualityScore } from '../../services/qualityScore.js';
import { paymentService } from '../payments/service.js';
import { logger } from '../../lib/logger.js';

const router: Router = Router();

/** The five checks every garment goes through. Shown verbatim to the customer. */
const CRITERIA = [
  'DESIGN_SIMILARITY',
  'STITCHING',
  'MEASUREMENTS',
  'EMBROIDERY',
  'FINISHING',
] as const;

const startSchema = z.object({ orderId: z.string().cuid() });

const photosSchema = z.object({
  photos: z
    .array(
      z.object({
        url: z.string().url(),
        caption: z.string().max(200).optional(),
        view: z.enum(['FRONT', 'BACK', 'DETAIL', 'TAG']).optional(),
      }),
    )
    .min(1)
    .max(20),
});

const decideSchema = z.object({
  items: z
    .array(
      z.object({
        criterion: z.enum(CRITERIA),
        passed: z.boolean(),
        note: z.string().max(500).optional(),
      }),
    )
    .length(CRITERIA.length),
  overallNote: z.string().max(1000).optional(),
});

const queueSchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['NOT_STARTED', 'IN_REVIEW', 'PASSED', 'FAILED', 'PASSED_WITH_NOTES']).optional(),
});

router.use(requireAuth);

/** Customer-visible QC result for their order. */
router.get(
  '/orders/:orderId',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: param(req, 'orderId') },
      select: { customerId: true, designerId: true },
    });
    if (!order) throw notFound('That order');

    const isCustomer = order.customerId === req.user!.id;
    const isDesigner = req.user!.designerId === order.designerId;
    const isStaff = ['OPS', 'ADMIN'].includes(req.user!.role);
    if (!isCustomer && !isDesigner && !isStaff) throw notFound('That order');

    const checks = await prisma.qualityCheck.findMany({
      where: { orderId: param(req, 'orderId') },
      orderBy: { round: 'desc' },
      include: { items: true, photos: { orderBy: { sortOrder: 'asc' } } },
    });

    return ok(res, {
      checks,
      criteria: CRITERIA,
      passedMessage: 'Your order passed Zari Quality Check.',
    });
  }),
);

// --- Ops-only from here -----------------------------------------------------

router.use(requireRole('OPS', 'ADMIN'));

/** /ops/qc �?" the review queue. */
router.get(
  '/queue',
  validate(queueSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof queueSchema>;
    const rows = await prisma.qualityCheck.findMany({
      where: query.status ? { status: query.status } : { status: { in: ['NOT_STARTED', 'IN_REVIEW'] } },
      orderBy: { createdAt: 'asc' },
      ...cursorArgs(query.cursor, query.limit),
      include: {
        photos: { take: 3, orderBy: { sortOrder: 'asc' } },
        order: {
          select: {
            id: true,
            code: true,
            finalPrice: true,
            promisedDate: true,
            designer: { select: { studioName: true, city: true, qualityScore: true } },
            version: { select: { spec: true, design: { select: { title: true } } } },
          },
        },
      },
    });
    return ok(res, toPage(rows, query.limit));
  }),
);

router.post(
  '/start',
  validate(startSchema),
  asyncHandler(async (req, res) => {
    const orderId = req.body.orderId as string;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { qualityChecks: { orderBy: { round: 'desc' }, take: 1 } },
    });
    if (!order) throw notFound('That order');

    const round = (order.qualityChecks[0]?.round ?? 0) + 1;

    const check = await prisma.$transaction(async (tx) => {
      const c = await tx.qualityCheck.create({
        data: {
          orderId,
          round,
          status: 'IN_REVIEW',
          reviewerId: req.user!.id,
          startedAt: new Date(),
          items: {
            create: CRITERIA.map((criterion, index) => ({ criterion, sortOrder: index })),
          },
        },
        include: { items: true },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: 'QC_PENDING' } });
      await tx.orderMilestone.updateMany({
        where: { orderId, type: 'QUALITY_CHECK' },
        data: { status: 'IN_PROGRESS' },
      });
      return c;
    });

    return created(res, check);
  }),
);

/** Uploading QC photos also runs the AI similarity check against the design. */
router.post(
  '/:checkId/photos',
  validate(photosSchema),
  asyncHandler(async (req, res) => {
    const check = await prisma.qualityCheck.findUnique({
      where: { id: param(req, 'checkId') },
      include: { order: { include: { version: true } } },
    });
    if (!check) throw notFound('That quality check');

    const photos = req.body.photos as { url: string; caption?: string; view?: string }[];

    await prisma.qcPhoto.createMany({
      data: photos.map((p, index) => ({
        checkId: check.id,
        url: p.url,
        caption: p.caption ?? null,
        view: p.view ?? null,
        sortOrder: index,
      })),
    });

    // Advisory only �?" a human reviewer still makes the call.
    let similarity: number | null = null;
    try {
      const result = await aiClient.qcSimilarity({
        spec: check.order.version.spec as unknown as DesignSpec,
        photoUrls: photos.map((p) => p.url),
      });
      similarity = result.similarityScore;
      await prisma.qualityCheck.update({
        where: { id: check.id },
        data: { aiSimilarityScore: similarity },
      });
    } catch (err) {
      logger.warn({ err, checkId: check.id }, 'QC similarity check failed; continuing');
    }

    const updated = await prisma.qualityCheck.findUniqueOrThrow({
      where: { id: check.id },
      include: { photos: { orderBy: { sortOrder: 'asc' } }, items: true },
    });

    return created(res, { check: updated, aiSimilarityScore: similarity });
  }),
);

/**
 * The decision. A pass is what releases the escrow balance to the designer �?"
 * this is the single place that money is unlocked.
 */
router.post(
  '/:checkId/decide',
  validate(decideSchema),
  asyncHandler(async (req, res) => {
    const check = await prisma.qualityCheck.findUnique({
      where: { id: param(req, 'checkId') },
      include: { order: { include: { designer: { select: { userId: true } } } } },
    });
    if (!check) throw notFound('That quality check');
    if (check.status === 'PASSED') throw conflict('This check has already passed.');

    const items = req.body.items as { criterion: string; passed: boolean; note?: string }[];
    const failed = items.filter((i) => !i.passed);
    const status = failed.length === 0 ? 'PASSED' : 'FAILED';

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.qualityCheckItem.update({
          where: { checkId_criterion: { checkId: check.id, criterion: item.criterion } },
          data: { passed: item.passed, note: item.note ?? null },
        });
      }

      await tx.qualityCheck.update({
        where: { id: check.id },
        data: {
          status,
          overallNote: (req.body.overallNote as string | undefined) ?? null,
          completedAt: new Date(),
        },
      });

      await tx.order.update({
        where: { id: check.orderId },
        data: { status: status === 'PASSED' ? 'QC_PENDING' : 'QC_FAILED' },
      });

      await tx.orderMilestone.updateMany({
        where: { orderId: check.orderId, type: 'QUALITY_CHECK' },
        data: {
          status: status === 'PASSED' ? 'DONE' : 'BLOCKED',
          occurredAt: new Date(),
          note: status === 'PASSED' ? 'Passed Zari Quality Check' : failed.map((f) => f.criterion).join(', '),
        },
      });

      await notify(tx, {
        userId: check.order.customerId,
        type: 'QC_RESULT',
        title:
          status === 'PASSED'
            ? `${check.order.code} passed Zari Quality Check`
            : `${check.order.code} needs a correction`,
        linkUrl: `/app/orders/${check.orderId}`,
      });

      await notify(tx, {
        userId: check.order.designer.userId,
        type: 'QC_RESULT',
        title:
          status === 'PASSED'
            ? `Quality check passed for ${check.order.code}`
            : `Quality check flagged ${failed.length} item(s) on ${check.order.code}`,
        body: failed.map((f) => `${f.criterion}: ${f.note ?? 'needs correction'}`).join(' · '),
        linkUrl: `/designer/orders/${check.orderId}`,
      });

      await auditLog(tx, {
        actorId: req.user!.id,
        action: `qc.${status.toLowerCase()}`,
        entityType: 'QualityCheck',
        entityId: check.id,
        after: { items, status } as Prisma.InputJsonValue,
      });
    });

    if (status === 'PASSED') {
      await paymentService.releaseEscrow(check.orderId, req.user!.id);
    }

    await recomputeQualityScore(check.order.designerId, `qc.${status.toLowerCase()}`).catch(
      () => undefined,
    );

    const result = await prisma.qualityCheck.findUniqueOrThrow({
      where: { id: check.id },
      include: { items: true, photos: true },
    });

    return ok(res, result);
  }),
);

export default router;
