import type { MilestoneType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { orderCode } from '../../lib/ids.js';
import { cursorArgs, toPage } from '../../lib/http.js';
import { percentOf, splitEscrow } from '../../lib/money.js';
import { auditLog, notify, postSystemMessage } from '../../services/notifications.js';
import { recomputeQualityScore } from '../../services/qualityScore.js';

/** The production timeline every order gets, in order. */
const MILESTONE_PLAN: { type: MilestoneType; title: string }[] = [
  { type: 'DESIGN_CONFIRMED', title: 'Design confirmed' },
  { type: 'MEASUREMENTS_RECEIVED', title: 'Measurements received' },
  { type: 'FABRIC_SOURCED', title: 'Fabric sourced' },
  { type: 'CUTTING', title: 'Cutting' },
  { type: 'EMBROIDERY', title: 'Embroidery' },
  { type: 'STITCHING', title: 'Stitching' },
  { type: 'QUALITY_CHECK', title: 'Zari quality check' },
  { type: 'SHIPPED', title: 'Shipped' },
  { type: 'DELIVERED', title: 'Delivered' },
  { type: 'FIT_WINDOW_OPEN', title: 'Fit window open' },
];

/** Milestones the designer is allowed to move. QC and delivery are Zari's. */
const DESIGNER_EDITABLE = new Set<MilestoneType>([
  'MEASUREMENTS_RECEIVED',
  'FABRIC_SOURCED',
  'CUTTING',
  'EMBROIDERY',
  'STITCHING',
]);

const orderInclude = {
  version: {
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      costEstimate: { include: { lineItems: { orderBy: { sortOrder: 'asc' } } } },
      design: { select: { id: true, title: true } },
    },
  },
  designer: {
    select: {
      id: true,
      studioName: true,
      slug: true,
      city: true,
      logoUrl: true,
      qualityScore: true,
      userId: true,
    },
  },
  customer: { select: { id: true, name: true, avatarUrl: true } },
  milestones: { orderBy: { sortOrder: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
  qualityChecks: {
    orderBy: { round: 'desc' },
    include: { items: true, photos: { orderBy: { sortOrder: 'asc' } } },
  },
  fitFeedback: true,
  alterations: { orderBy: { createdAt: 'desc' } },
  address: true,
} satisfies Prisma.OrderInclude;

async function loadOrderFor(orderId: string, user: { id: string; designerId?: string | null; role: string }) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) throw notFound('That order');

  const isCustomer = order.customerId === user.id;
  const isDesigner = user.designerId && order.designerId === user.designerId;
  const isStaff = user.role === 'OPS' || user.role === 'ADMIN';

  if (!isCustomer && !isDesigner && !isStaff) {
    throw forbidden('This order belongs to someone else.');
  }
  return { order, isCustomer, isDesigner: Boolean(isDesigner), isStaff };
}

export const orderService = {
  loadOrderFor,
  MILESTONE_PLAN,

  /**
   * Accepting a bid creates the order in PENDING_PAYMENT. No money moves here —
   * the escrow advance is charged by the payments module, and only then does
   * the order become CONFIRMED and the designer get notified to start.
   */
  async acceptBid(
    customerId: string,
    bidId: string,
    input: { measurementId?: string | null; addressId?: string | null },
  ) {
    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        request: { include: { design: true, version: true } },
        designer: { select: { id: true, userId: true, studioName: true } },
      },
    });
    if (!bid) throw notFound('That quote');
    if (bid.request.customerId !== customerId) throw forbidden('This quote is not yours to accept.');
    if (bid.status !== 'SUBMITTED' && bid.status !== 'SHORTLISTED') {
      throw conflict('That quote is no longer available.');
    }
    if (bid.request.status !== 'OPEN') throw conflict('This request is already closed.');

    const finalPrice = bid.price + (bid.proposedPriceDelta ?? 0);
    const { advance, balance } = splitEscrow(finalPrice, env.ADVANCE_PERCENT);
    const platformFee = percentOf(finalPrice, env.PLATFORM_FEE_PERCENT);

    let measurementSnapshot: Prisma.InputJsonValue | undefined;
    if (input.measurementId) {
      const m = await prisma.measurement.findUnique({ where: { id: input.measurementId } });
      if (m) measurementSnapshot = { label: m.label, unit: m.unit, values: m.values } as Prisma.InputJsonValue;
    }

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          code: orderCode(),
          customerId,
          designerId: bid.designerId,
          versionId: bid.request.versionId,
          requestId: bid.requestId,
          bidId: bid.id,
          status: 'PENDING_PAYMENT',
          finalPrice,
          advancePercent: env.ADVANCE_PERCENT,
          advanceAmount: advance,
          balanceAmount: balance,
          platformFee,
          leadTimeDays: bid.leadTimeDays,
          promisedDate: new Date(Date.now() + bid.leadTimeDays * 24 * 60 * 60 * 1000),
          measurementId: input.measurementId ?? null,
          addressId: input.addressId ?? null,
          measurementSnapshot,
          milestones: {
            create: MILESTONE_PLAN.map((m, index) => ({
              type: m.type,
              title: m.title,
              status: 'PENDING',
              sortOrder: index,
            })),
          },
        },
      });

      await tx.bid.update({ where: { id: bid.id }, data: { status: 'ACCEPTED' } });
      await tx.bid.updateMany({
        where: { requestId: bid.requestId, id: { not: bid.id }, status: { in: ['SUBMITTED', 'SHORTLISTED'] } },
        data: { status: 'REJECTED' },
      });
      await tx.designRequest.update({
        where: { id: bid.requestId },
        data: { status: 'AWARDED', awardedBidId: bid.id },
      });
      await tx.design.update({ where: { id: bid.request.designId }, data: { status: 'ORDERED' } });

      const conversation = await tx.conversation.create({
        data: {
          type: 'ORDER',
          orderId: order.id,
          subject: bid.request.design.title,
          lastMessageAt: new Date(),
          participants: {
            create: [{ userId: customerId }, { userId: bid.designer.userId }],
          },
        },
      });

      await postSystemMessage(
        tx,
        conversation.id,
        customerId,
        `Order ${order.code} created. Awaiting the ${env.ADVANCE_PERCENT}% escrow payment.`,
      );

      await auditLog(tx, {
        actorId: customerId,
        action: 'order.created',
        entityType: 'Order',
        entityId: order.id,
        after: { finalPrice, bidId: bid.id },
      });

      return order;
    });
  },

  async list(
    user: { id: string; designerId?: string | null; role: string },
    query: { cursor?: string; limit: number; status?: string; as?: 'customer' | 'designer' },
  ) {
    const asDesigner = query.as === 'designer' || (!query.as && Boolean(user.designerId));

    const where: Prisma.OrderWhereInput = asDesigner && user.designerId
      ? { designerId: user.designerId }
      : { customerId: user.id };

    if (query.status) where.status = query.status as never;

    const rows = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...cursorArgs(query.cursor, query.limit),
      include: {
        version: {
          select: {
            images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } },
            design: { select: { title: true } },
          },
        },
        designer: { select: { id: true, studioName: true, city: true, slug: true } },
        customer: { select: { id: true, name: true } },
        milestones: {
          where: { status: 'IN_PROGRESS' },
          take: 1,
          select: { type: true, title: true },
        },
      },
    });

    return toPage(rows, query.limit);
  },

  async get(orderId: string, user: { id: string; designerId?: string | null; role: string }) {
    const { order } = await loadOrderFor(orderId, user);

    // Escrow explanation travels with the order — trust info must be present at
    // the exact moment money is discussed.
    return {
      ...order,
      escrow: {
        advancePercent: order.advancePercent,
        advanceAmount: order.advanceAmount,
        balanceAmount: order.balanceAmount,
        advancePaid: order.payments.some((p) => p.type === 'ADVANCE' && p.status === 'CAPTURED'),
        balanceReleased: order.payments.some((p) => p.type === 'BALANCE' && p.status === 'CAPTURED'),
        explanation:
          'Your designer does not receive the final payment until Zari’s quality check passes.',
      },
      fitGuarantee: {
        windowDays: env.FIT_WINDOW_DAYS,
        endsAt: order.fitWindowEndsAt,
        freeAlterationUsed: order.freeAlterationUsed,
        explanation: 'You have 7 days to try it on. Your first alteration is free.',
      },
    };
  },

  /** Designer updates a production milestone; customer sees it on the timeline. */
  async updateMilestone(
    orderId: string,
    milestoneId: string,
    user: { id: string; designerId?: string | null; role: string },
    input: { status?: string; note?: string | null; photoUrls?: string[] },
  ) {
    const { order, isDesigner, isStaff } = await loadOrderFor(orderId, user);
    if (!isDesigner && !isStaff) throw forbidden('Only the designer can update production.');

    const milestone = order.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw notFound('That milestone');

    if (isDesigner && !isStaff && !DESIGNER_EDITABLE.has(milestone.type)) {
      throw forbidden('Zari updates this step for you.');
    }
    if (order.status === 'PENDING_PAYMENT') {
      throw conflict('Production starts once the escrow advance is paid.');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.orderMilestone.update({
        where: { id: milestoneId },
        data: {
          ...(input.status ? { status: input.status as never } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.photoUrls ? { photoUrls: input.photoUrls } : {}),
          ...(input.status === 'DONE' ? { occurredAt: new Date() } : {}),
        },
      });

      if (order.status === 'CONFIRMED') {
        await tx.order.update({ where: { id: orderId }, data: { status: 'IN_PRODUCTION' } });
      }

      const conversation = await tx.conversation.findFirst({ where: { orderId } });
      if (conversation) {
        await postSystemMessage(
          tx,
          conversation.id,
          user.id,
          `${milestone.title}: ${updated.status.toLowerCase().replace('_', ' ')}`,
        );
      }

      await notify(tx, {
        userId: order.customerId,
        type: 'MILESTONE_UPDATED',
        title: `${order.code}: ${milestone.title}`,
        body: input.note ?? undefined,
        linkUrl: `/app/orders/${order.id}`,
        data: { orderId, milestoneId },
      });

      return updated;
    });
  },

  /** Zari marks the order shipped after QC passes. */
  async markShipped(orderId: string, user: { id: string; role: string; designerId?: string | null }) {
    const { order, isStaff } = await loadOrderFor(orderId, user);
    if (!isStaff) throw forbidden('Zari handles dispatch.');
    if (order.status !== 'QC_PENDING' && order.status !== 'IN_PRODUCTION') {
      const passed = order.qualityChecks.some((q) => q.status === 'PASSED' || q.status === 'PASSED_WITH_NOTES');
      if (!passed) throw conflict('Quality control has not passed yet.');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'SHIPPED', shippedAt: new Date() },
      });
      await tx.orderMilestone.updateMany({
        where: { orderId, type: 'SHIPPED' },
        data: { status: 'DONE', occurredAt: new Date() },
      });
      await notify(tx, {
        userId: order.customerId,
        type: 'MILESTONE_UPDATED',
        title: `${order.code} is on its way`,
        linkUrl: `/app/orders/${orderId}`,
      });
      return updated;
    });
  },

  /** Delivery opens the 7-day fit window. */
  async markDelivered(orderId: string, user: { id: string; role: string; designerId?: string | null }) {
    const { order, isStaff, isCustomer } = await loadOrderFor(orderId, user);
    if (!isStaff && !isCustomer) throw forbidden('Only Zari or you can confirm delivery.');

    const deliveredAt = new Date();
    const fitWindowEndsAt = new Date(deliveredAt.getTime() + env.FIT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'FIT_WINDOW', deliveredAt, fitWindowEndsAt },
      });
      await tx.orderMilestone.updateMany({
        where: { orderId, type: { in: ['DELIVERED', 'FIT_WINDOW_OPEN'] } },
        data: { status: 'DONE', occurredAt: deliveredAt },
      });
      await notify(tx, {
        userId: order.customerId,
        type: 'FIT_WINDOW_OPEN',
        title: 'How does it fit?',
        body: 'You have 7 days to try it on. Your first alteration is free.',
        linkUrl: `/app/orders/${orderId}`,
      });
      return updated;
    });

    // Recomputed AFTER the transaction closes. It reads and writes on the
    // global client, so running it inside would block on a pool the open
    // transaction is already holding. The score is derived data — recomputing
    // it a moment later is fine; deadlocking the delivery is not.
    await recomputeQualityScore(order.designerId, 'order.delivered').catch(() => undefined);
    return result;
  },

  async submitFitFeedback(
    orderId: string,
    customerId: string,
    input: { rating: string; note?: string | null; photoUrls?: string[] },
  ) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('That order');
    if (order.customerId !== customerId) throw forbidden('This order belongs to someone else.');
    if (!order.deliveredAt) throw badRequest('The garment has not been delivered yet.');

    const feedback = await prisma.$transaction(async (tx) => {
      const saved = await tx.fitFeedback.upsert({
        where: { orderId },
        create: {
          orderId,
          rating: input.rating as never,
          note: input.note ?? null,
          photoUrls: input.photoUrls ?? [],
        },
        update: {
          rating: input.rating as never,
          note: input.note ?? null,
          photoUrls: input.photoUrls ?? [],
        },
      });

      if (input.rating === 'PERFECT') {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        await tx.orderMilestone.updateMany({
          where: { orderId, type: 'COMPLETED' },
          data: { status: 'DONE', occurredAt: new Date() },
        });
      }

      return saved;
    });

    // Outside the transaction, for the same pool reason as markDelivered.
    await recomputeQualityScore(order.designerId, 'fit.feedback').catch(() => undefined);
    return feedback;
  },

  /** First alteration is always free — that is a promise, not a setting. */
  async requestAlteration(
    orderId: string,
    customerId: string,
    input: { description: string; photoUrls?: string[] },
  ) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { designer: { select: { userId: true } } },
    });
    if (!order) throw notFound('That order');
    if (order.customerId !== customerId) throw forbidden('This order belongs to someone else.');
    if (!order.deliveredAt) throw badRequest('The garment has not been delivered yet.');
    if (order.fitWindowEndsAt && order.fitWindowEndsAt < new Date() && order.freeAlterationUsed) {
      throw conflict('Your fit window has closed. Message your designer to arrange a paid alteration.');
    }

    const isFree = !order.freeAlterationUsed;

    return prisma.$transaction(async (tx) => {
      const alteration = await tx.alterationRequest.create({
        data: {
          orderId,
          description: input.description,
          photoUrls: input.photoUrls ?? [],
          isFree,
        },
      });

      if (isFree) {
        await tx.order.update({ where: { id: orderId }, data: { freeAlterationUsed: true } });
      }

      await notify(tx, {
        userId: order.designer.userId,
        type: 'MILESTONE_UPDATED',
        title: `Alteration requested on ${order.code}`,
        body: input.description.slice(0, 140),
        linkUrl: `/designer/orders/${orderId}`,
      });

      return alteration;
    });
  },

  async leaveReview(
    orderId: string,
    customerId: string,
    input: { rating: number; title?: string | null; body?: string | null; aspects?: Record<string, number>; photoUrls?: string[] },
  ) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('That order');
    if (order.customerId !== customerId) throw forbidden('This order belongs to someone else.');
    if (!order.deliveredAt) throw badRequest('You can review once the garment arrives.');

    const review = await prisma.review.upsert({
      where: { orderId },
      create: {
        orderId,
        authorId: customerId,
        designerId: order.designerId,
        rating: input.rating,
        title: input.title ?? null,
        body: input.body ?? null,
        aspects: (input.aspects ?? {}) as Prisma.InputJsonValue,
        photoUrls: input.photoUrls ?? [],
      },
      update: {
        rating: input.rating,
        title: input.title ?? null,
        body: input.body ?? null,
        aspects: (input.aspects ?? {}) as Prisma.InputJsonValue,
        photoUrls: input.photoUrls ?? [],
      },
    });

    await recomputeQualityScore(order.designerId, 'review.created').catch(() => undefined);
    return review;
  },
};
