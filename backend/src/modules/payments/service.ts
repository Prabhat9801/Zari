import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  createProviderOrder,
  createPayout,
  refundPayment,
  verifyPaymentSignature,
} from '../../services/payments.js';
import { auditLog, notify, postSystemMessage } from '../../services/notifications.js';

/**
 * ESCROW STATE MACHINE
 *
 *   advance captured  -> LedgerEntry(CREDIT, HELD)   -> order CONFIRMED
 *   balance captured  -> LedgerEntry(CREDIT, HELD)
 *   QC passes         -> LedgerEntry(DEBIT, RELEASED) + Payout to designer
 *   dispute refund    -> LedgerEntry(DEBIT, REFUNDED)
 *
 * Money is only ever RELEASED by releaseEscrow(), and that is only called from
 * the QC pass path. There is deliberately no admin "just pay them" shortcut.
 */

const heldTotal = (entries: { direction: string; state: string; amount: number }[]): number =>
  entries.reduce((sum, e) => {
    if (e.state !== 'HELD') return sum;
    return e.direction === 'CREDIT' ? sum + e.amount : sum - e.amount;
  }, 0);

export const paymentService = {
  /** Creates a provider order for the advance or the balance. */
  async createIntent(orderId: string, customerId: string, type: 'ADVANCE' | 'BALANCE') {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });
    if (!order) throw notFound('That order');
    if (order.customerId !== customerId) throw forbidden('This order belongs to someone else.');

    const alreadyPaid = order.payments.some((p) => p.type === type && p.status === 'CAPTURED');
    if (alreadyPaid) throw conflict('That payment has already been made.');

    if (type === 'BALANCE') {
      const qcPassed = await prisma.qualityCheck.findFirst({
        where: { orderId, status: { in: ['PASSED', 'PASSED_WITH_NOTES'] } },
      });
      if (!qcPassed) throw conflict('The balance is due only after Zari quality control passes.');
    }

    const amount = type === 'ADVANCE' ? order.advanceAmount : order.balanceAmount;

    const providerOrder = await createProviderOrder({
      amount,
      receipt: `${order.code}-${type}`,
      notes: { orderId: order.id, orderCode: order.code, type },
    });

    const payment = await prisma.payment.create({
      data: {
        orderId,
        type,
        amount,
        status: 'CREATED',
        providerOrderId: providerOrder.id,
      },
    });

    return {
      paymentId: payment.id,
      providerOrderId: providerOrder.id,
      amount,
      currency: 'INR',
      escrowNote:
        type === 'ADVANCE'
          ? 'This is held in escrow. Your designer is paid the balance only after Zari’s quality check passes.'
          : 'Released to your designer now that quality control has passed.',
    };
  },

  /**
   * Confirms a payment from the checkout callback. The signature is the proof —
   * we never trust the client saying "it worked".
   */
  async confirm(
    paymentId: string,
    customerId: string,
    input: { providerPaymentId: string; signature: string },
  ) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { designer: { select: { userId: true, studioName: true } } } } },
    });
    if (!payment) throw notFound('That payment');
    if (payment.order.customerId !== customerId) throw forbidden('That payment is not yours.');
    if (payment.status === 'CAPTURED') return payment;
    if (!payment.providerOrderId) throw badRequest('That payment was never started.');

    const valid = verifyPaymentSignature({
      providerOrderId: payment.providerOrderId,
      providerPaymentId: input.providerPaymentId,
      signature: input.signature,
    });

    if (!valid) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'FAILED', failureReason: 'signature_mismatch' },
      });
      throw badRequest('We could not verify that payment. Nothing has been charged.');
    }

    return paymentService.markCaptured(payment.id, input.providerPaymentId, input.signature);
  },

  /** Shared by the callback path and the webhook path. Idempotent. */
  async markCaptured(paymentId: string, providerPaymentId: string, signature?: string) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: {
          order: { include: { designer: { select: { userId: true, studioName: true } } } },
        },
      });

      if (payment.status === 'CAPTURED') return payment;

      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'CAPTURED',
          providerPaymentId,
          providerSignature: signature ?? null,
          capturedAt: new Date(),
        },
      });

      await tx.ledgerEntry.create({
        data: {
          orderId: payment.orderId,
          direction: 'CREDIT',
          state: 'HELD',
          amount: payment.amount,
          reason: `${payment.type} captured into escrow`,
          paymentId: payment.id,
        },
      });

      if (payment.type === 'ADVANCE') {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: 'CONFIRMED' },
        });
        await tx.orderMilestone.updateMany({
          where: { orderId: payment.orderId, type: 'DESIGN_CONFIRMED' },
          data: { status: 'DONE', occurredAt: new Date() },
        });

        await notify(tx, {
          userId: payment.order.designer.userId,
          type: 'ORDER_CONFIRMED',
          title: `Order ${payment.order.code} is confirmed`,
          body: 'The advance is held in escrow. You can begin production.',
          linkUrl: `/designer/orders/${payment.orderId}`,
        });

        const conversation = await tx.conversation.findFirst({
          where: { orderId: payment.orderId },
        });
        if (conversation) {
          await postSystemMessage(
            tx,
            conversation.id,
            payment.order.customerId,
            `Escrow funded — ${payment.order.advancePercent}% is held by Zari until quality control passes.`,
          );
        }
      }

      await auditLog(tx, {
        action: 'payment.captured',
        entityType: 'Payment',
        entityId: payment.id,
        after: { amount: payment.amount, type: payment.type },
      });

      return updated;
    });
  },

  /**
   * Called ONLY from the QC pass path. Moves held funds to RELEASED and queues
   * the designer payout minus the platform fee.
   */
  async releaseEscrow(orderId: string, actorId: string | null) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        ledgerEntries: true,
        designer: { select: { id: true, userId: true, payoutAccount: true, studioName: true } },
      },
    });
    if (!order) throw notFound('That order');

    const held = heldTotal(order.ledgerEntries);
    if (held <= 0) throw conflict('There is nothing held in escrow for this order.');

    const payoutAmount = Math.max(0, held - order.platformFee);

    const payout = await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.create({
        data: {
          orderId,
          direction: 'DEBIT',
          state: 'RELEASED',
          amount: payoutAmount,
          reason: 'Released to designer after Zari quality check',
        },
      });

      if (order.platformFee > 0) {
        await tx.ledgerEntry.create({
          data: {
            orderId,
            direction: 'DEBIT',
            state: 'FEE',
            amount: order.platformFee,
            reason: 'Zari platform fee',
          },
        });
      }

      const created = await tx.payout.create({
        data: { orderId, designerId: order.designerId, amount: payoutAmount, status: 'PENDING' },
      });

      await notify(tx, {
        userId: order.designer.userId,
        type: 'PAYMENT_UPDATE',
        title: `Payment released for ${order.code}`,
        body: 'Quality control passed. Your payout is on its way.',
        linkUrl: `/designer/earnings`,
      });

      await auditLog(tx, {
        actorId,
        action: 'escrow.released',
        entityType: 'Order',
        entityId: orderId,
        after: { payoutAmount, platformFee: order.platformFee },
      });

      return created;
    });

    // Attempting the transfer is best-effort; a failure leaves the payout
    // PENDING for ops to retry rather than rolling back the ledger.
    const fundAccountId = order.designer.payoutAccount?.providerRef;
    if (fundAccountId) {
      try {
        const ref = await createPayout({
          fundAccountId,
          amount: payoutAmount,
          reference: `${order.code}-payout`,
        });
        await prisma.payout.update({
          where: { id: payout.id },
          data: { status: 'PROCESSING', providerRef: ref },
        });
      } catch (err) {
        logger.error({ err, payoutId: payout.id }, 'Payout transfer failed; left PENDING');
        await prisma.payout.update({
          where: { id: payout.id },
          data: { failureReason: 'transfer_failed' },
        });
      }
    }

    return payout;
  },

  async refund(orderId: string, amount: number, reason: string, actorId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { where: { status: 'CAPTURED' }, orderBy: { createdAt: 'asc' } } },
    });
    if (!order) throw notFound('That order');

    const source = order.payments[0];
    if (!source?.providerPaymentId) throw conflict('There is no captured payment to refund.');

    const refundId = await refundPayment(source.providerPaymentId, amount);

    return prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.create({
        data: {
          orderId,
          direction: 'DEBIT',
          state: 'REFUNDED',
          amount,
          reason,
        },
      });
      await tx.payment.create({
        data: {
          orderId,
          type: 'REFUND',
          status: 'REFUNDED',
          amount,
          providerPaymentId: refundId,
          refundedAt: new Date(),
        },
      });
      await notify(tx, {
        userId: order.customerId,
        type: 'PAYMENT_UPDATE',
        title: `Refund issued for ${order.code}`,
        body: reason,
        linkUrl: `/app/orders/${orderId}`,
      });
      await auditLog(tx, {
        actorId,
        action: 'payment.refunded',
        entityType: 'Order',
        entityId: orderId,
        after: { amount, reason },
      });
      return { refundId, amount };
    });
  },

  /** Customer-facing escrow summary for the order page. */
  async escrowSummary(orderId: string, userId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { ledgerEntries: true, payments: true, payouts: true },
    });
    if (!order) throw notFound('That order');
    if (order.customerId !== userId) throw forbidden('This order belongs to someone else.');

    return {
      finalPrice: order.finalPrice,
      advanceAmount: order.advanceAmount,
      balanceAmount: order.balanceAmount,
      heldInEscrow: heldTotal(order.ledgerEntries),
      released: order.ledgerEntries
        .filter((e) => e.state === 'RELEASED')
        .reduce((s, e) => s + e.amount, 0),
      refunded: order.ledgerEntries
        .filter((e) => e.state === 'REFUNDED')
        .reduce((s, e) => s + e.amount, 0),
      payments: order.payments.map((p) => ({
        id: p.id,
        type: p.type,
        status: p.status,
        amount: p.amount,
        capturedAt: p.capturedAt,
      })),
      explanation:
        'Your designer does not receive the final payment until Zari’s quality check passes.',
    };
  },

  /** Idempotent webhook processing, guarded by the WebhookEvent unique index. */
  async handleWebhook(eventId: string, eventType: string, payload: Record<string, unknown>) {
    try {
      await prisma.webhookEvent.create({
        data: { provider: 'razorpay', eventId, eventType, payload: payload as Prisma.InputJsonValue },
      });
    } catch {
      logger.info({ eventId }, 'Duplicate webhook ignored');
      return { duplicate: true };
    }

    const entity = (payload as { payload?: { payment?: { entity?: Record<string, unknown> } } })
      ?.payload?.payment?.entity;

    if (eventType === 'payment.captured' && entity) {
      const providerOrderId = entity.order_id as string | undefined;
      const providerPaymentId = entity.id as string | undefined;

      if (providerOrderId && providerPaymentId) {
        const payment = await prisma.payment.findUnique({ where: { providerOrderId } });
        if (payment && payment.status !== 'CAPTURED') {
          await paymentService.markCaptured(payment.id, providerPaymentId);
        }
      }
    }

    if (eventType === 'payment.failed' && entity) {
      const providerOrderId = entity.order_id as string | undefined;
      if (providerOrderId) {
        await prisma.payment.updateMany({
          where: { providerOrderId, status: { not: 'CAPTURED' } },
          data: { status: 'FAILED', failureReason: String(entity.error_description ?? 'failed') },
        });
      }
    }

    await prisma.webhookEvent.updateMany({
      where: { provider: 'razorpay', eventId },
      data: { processedAt: new Date() },
    });

    return { duplicate: false };
  },
};
