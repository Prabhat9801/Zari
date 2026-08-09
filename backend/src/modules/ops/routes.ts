import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler, param, created, cursorArgs, noContent, ok, toPage } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { notFound } from '../../lib/errors.js';
import { auditLog, notify } from '../../services/notifications.js';
import { recomputeQualityScore } from '../../services/qualityScore.js';
import { paymentService } from '../payments/service.js';

const router: Router = Router();

router.use(requireAuth, requireRole('OPS', 'ADMIN'));

const pageSchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const verifySchema = z.object({
  status: z.enum(['IN_REVIEW', 'VERIFIED', 'REJECTED']),
  reviewNotes: z.string().trim().max(1000).nullish(),
});

const costRuleSchema = z.object({
  component: z.enum(['FABRIC', 'LINING', 'EMBROIDERY', 'STITCHING', 'TRIMS', 'FINISHING', 'OTHER']),
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(120),
  minRate: z.number().int().nonnegative(),
  maxRate: z.number().int().nonnegative(),
  unit: z.string().trim().max(20).default('m'),
  region: z.string().trim().max(60).nullish(),
  multiplier: z.number().positive().max(10).default(1),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(500).nullish(),
});

const resolveDisputeSchema = z.object({
  status: z.enum(['RESOLVED_CUSTOMER', 'RESOLVED_DESIGNER', 'RESOLVED_SPLIT']),
  resolutionNote: z.string().trim().min(4).max(2000),
  refundAmount: z.number().int().nonnegative().optional(),
});

// --- Overview ---------------------------------------------------------------

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [qcQueue, pendingVerifications, openDisputes, activeOrders, pendingPayouts] =
      await Promise.all([
        prisma.qualityCheck.count({ where: { status: { in: ['NOT_STARTED', 'IN_REVIEW'] } } }),
        prisma.designerVerification.count({ where: { status: { in: ['PENDING', 'IN_REVIEW'] } } }),
        prisma.dispute.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
        prisma.order.count({
          where: { status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'QC_PENDING'] } },
        }),
        prisma.payout.aggregate({
          where: { status: { in: ['PENDING', 'PROCESSING'] } },
          _sum: { amount: true },
          _count: true,
        }),
      ]);

    return ok(res, {
      qcQueue,
      pendingVerifications,
      openDisputes,
      activeOrders,
      pendingPayouts: { count: pendingPayouts._count, amount: pendingPayouts._sum.amount ?? 0 },
    });
  }),
);

// --- Designer verification --------------------------------------------------

router.get(
  '/designers',
  validate(pageSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof pageSchema>;
    const rows = await prisma.designerVerification.findMany({
      where: { status: { in: ['PENDING', 'IN_REVIEW'] } },
      orderBy: { submittedAt: 'asc' },
      ...cursorArgs(query.cursor, query.limit),
      include: {
        designer: {
          select: {
            id: true,
            studioName: true,
            city: true,
            slug: true,
            userId: true,
            portfolioItems: { take: 4, select: { coverUrl: true, title: true } },
          },
        },
      },
    });
    return ok(res, toPage(rows, query.limit));
  }),
);

router.post(
  '/designers/:designerId/verify',
  validate(verifySchema),
  asyncHandler(async (req, res) => {
    const designerId = param(req, 'designerId');
    const body = req.body as z.infer<typeof verifySchema>;

    const designer = await prisma.designerProfile.findUnique({
      where: { id: designerId },
      select: { userId: true, studioName: true },
    });
    if (!designer) throw notFound('That studio');

    const result = await prisma.$transaction(async (tx) => {
      const verification = await tx.designerVerification.upsert({
        where: { designerId },
        create: {
          designerId,
          status: body.status,
          reviewerId: req.user!.id,
          reviewNotes: body.reviewNotes ?? null,
          reviewedAt: new Date(),
        },
        update: {
          status: body.status,
          reviewerId: req.user!.id,
          reviewNotes: body.reviewNotes ?? null,
          reviewedAt: new Date(),
        },
      });

      await tx.designerProfile.update({
        where: { id: designerId },
        data: {
          verificationStatus: body.status,
          ...(body.status === 'VERIFIED' ? { verifiedAt: new Date() } : {}),
        },
      });

      await notify(tx, {
        userId: designer.userId,
        type: 'SYSTEM',
        title:
          body.status === 'VERIFIED'
            ? 'Your studio is verified'
            : body.status === 'REJECTED'
              ? 'We need a bit more from your studio'
              : 'Your studio is under review',
        body: body.reviewNotes ?? undefined,
        linkUrl: '/designer/profile',
      });

      await auditLog(tx, {
        actorId: req.user!.id,
        action: `designer.verification.${body.status.toLowerCase()}`,
        entityType: 'DesignerProfile',
        entityId: designerId,
        after: { status: body.status },
      });

      return verification;
    });

    if (body.status === 'VERIFIED') {
      await recomputeQualityScore(designerId, 'verification.approved').catch(() => undefined);
    }

    return ok(res, result);
  }),
);

// --- Cost rules -------------------------------------------------------------

router.get(
  '/cost-rules',
  asyncHandler(async (_req, res) =>
    ok(
      res,
      await prisma.costRule.findMany({ orderBy: [{ component: 'asc' }, { key: 'asc' }] }),
    ),
  ),
);

router.post(
  '/cost-rules',
  validate(costRuleSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof costRuleSchema>;
    const data = { ...body, region: body.region ?? null, notes: body.notes ?? null };

    // Prisma cannot target a compound unique that contains a NULL column, and
    // `region` is null for the rules that apply everywhere — so find, then
    // update or create rather than upsert.
    const existing = await prisma.costRule.findFirst({
      where: { component: data.component, key: data.key, region: data.region },
      select: { id: true },
    });

    const rule = existing
      ? await prisma.costRule.update({ where: { id: existing.id }, data })
      : await prisma.costRule.create({ data });

    return created(res, rule);
  }),
);

router.delete(
  '/cost-rules/:id',
  asyncHandler(async (req, res) => {
    await prisma.costRule.update({ where: { id: param(req, 'id') }, data: { isActive: false } });
    return noContent(res);
  }),
);

// --- Disputes ---------------------------------------------------------------

router.get(
  '/disputes',
  validate(pageSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof pageSchema>;
    const rows = await prisma.dispute.findMany({
      where: { status: { in: ['OPEN', 'IN_REVIEW'] } },
      orderBy: { createdAt: 'asc' },
      ...cursorArgs(query.cursor, query.limit),
      include: {
        order: {
          select: {
            id: true,
            code: true,
            finalPrice: true,
            customer: { select: { name: true } },
            designer: { select: { studioName: true } },
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    });
    return ok(res, toPage(rows, query.limit));
  }),
);

router.post(
  '/disputes/:disputeId/resolve',
  validate(resolveDisputeSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof resolveDisputeSchema>;
    const dispute = await prisma.dispute.findUnique({
      where: { id: param(req, 'disputeId') },
      include: { order: { select: { id: true, customerId: true, code: true } } },
    });
    if (!dispute) throw notFound('That dispute');

    if (body.refundAmount && body.refundAmount > 0) {
      await paymentService.refund(
        dispute.orderId,
        body.refundAmount,
        body.resolutionNote,
        req.user!.id,
      );
    }

    const resolved = await prisma.$transaction(async (tx) => {
      const updated = await tx.dispute.update({
        where: { id: dispute.id },
        data: {
          status: body.status,
          resolverId: req.user!.id,
          resolutionNote: body.resolutionNote,
          refundAmount: body.refundAmount ?? null,
          resolvedAt: new Date(),
        },
      });

      await tx.order.update({
        where: { id: dispute.orderId },
        data: { status: body.status === 'RESOLVED_CUSTOMER' ? 'CANCELLED' : 'COMPLETED' },
      });

      await notify(tx, {
        userId: dispute.order.customerId,
        type: 'DISPUTE_UPDATE',
        title: `Dispute resolved on ${dispute.order.code}`,
        body: body.resolutionNote,
        linkUrl: `/app/orders/${dispute.orderId}`,
      });

      await auditLog(tx, {
        actorId: req.user!.id,
        action: 'dispute.resolved',
        entityType: 'Dispute',
        entityId: dispute.id,
        after: { status: body.status, refundAmount: body.refundAmount ?? 0 },
      });

      return updated;
    });

    return ok(res, resolved);
  }),
);

// --- Payouts ----------------------------------------------------------------

router.get(
  '/payouts',
  validate(pageSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof pageSchema>;
    const rows = await prisma.payout.findMany({
      where: { status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
      orderBy: { createdAt: 'asc' },
      ...cursorArgs(query.cursor, query.limit),
      include: {
        order: { select: { code: true } },
        designer: { select: { studioName: true, payoutAccount: true } },
      },
    });
    return ok(res, toPage(rows, query.limit));
  }),
);

router.post(
  '/payouts/:payoutId/mark-paid',
  asyncHandler(async (req, res) => {
    const payout = await prisma.payout.update({
      where: { id: param(req, 'payoutId') },
      data: { status: 'PAID', processedAt: new Date() },
    });
    return ok(res, payout);
  }),
);

export default router;
