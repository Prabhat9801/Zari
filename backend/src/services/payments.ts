import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env, paymentsEnabled } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { upstreamFailure } from '../lib/errors.js';

/**
 * Razorpay integration.
 *
 * Zari's escrow is a LEDGER, not a Razorpay feature: the customer's money is
 * captured to the Zari account and recorded as HELD in ledger_entries. It is
 * only marked RELEASED and paid out to the designer after quality control
 * passes. See src/modules/payments/service.ts for the state machine.
 */

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (!paymentsEnabled) {
    throw upstreamFailure('Payments are not configured on this environment yet.');
  }
  client ??= new Razorpay({
    key_id: env.RAZORPAY_KEY_ID!,
    key_secret: env.RAZORPAY_KEY_SECRET!,
  });
  return client;
}

export interface ProviderOrder {
  id: string;
  amount: number;
  currency: string;
}

/** amount is in PAISE, which is also Razorpay's unit — no conversion needed. */
export async function createProviderOrder(params: {
  amount: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<ProviderOrder> {
  try {
    const order = await getClient().orders.create({
      amount: params.amount,
      currency: 'INR',
      receipt: params.receipt,
      notes: params.notes,
      payment_capture: true,
    });
    return { id: order.id, amount: Number(order.amount), currency: order.currency };
  } catch (err) {
    logger.error({ err }, 'Razorpay order creation failed');
    throw upstreamFailure('We could not start that payment. Nothing has been charged.');
  }
}

/**
 * Verifies the checkout callback signature. Never mark a payment captured on
 * the client's word alone — this, or the webhook, is the only proof.
 */
export function verifyPaymentSignature(params: {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}): boolean {
  if (!paymentsEnabled) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET!)
    .update(`${params.providerOrderId}|${params.providerPaymentId}`)
    .digest('hex');
  return timingSafeEqual(expected, params.signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function refundPayment(providerPaymentId: string, amount: number): Promise<string> {
  try {
    const refund = await getClient().payments.refund(providerPaymentId, { amount });
    return refund.id;
  } catch (err) {
    logger.error({ err, providerPaymentId }, 'Razorpay refund failed');
    throw upstreamFailure('We could not process that refund. Our team has been notified.');
  }
}

/** Designer payout via RazorpayX. Returns the provider reference. */
export async function createPayout(params: {
  fundAccountId: string;
  amount: number;
  reference: string;
}): Promise<string> {
  if (!paymentsEnabled) {
    throw upstreamFailure('Payouts are not configured on this environment yet.');
  }
  // RazorpayX payouts are not exposed by the SDK's typed surface, so this goes
  // through the generic API helper. Kept in one place on purpose.
  try {
    const res = await (getClient() as unknown as {
      api: { post: (opts: { url: string; data: unknown }) => Promise<{ id: string }> };
    }).api.post({
      url: '/payouts',
      data: {
        fund_account_id: params.fundAccountId,
        amount: params.amount,
        currency: 'INR',
        mode: 'IMPS',
        purpose: 'payout',
        reference_id: params.reference,
        queue_if_low_balance: true,
      },
    });
    return res.id;
  } catch (err) {
    logger.error({ err }, 'RazorpayX payout failed');
    throw upstreamFailure('The payout could not be started. Our team has been notified.');
  }
}

export const publicPaymentConfig = () => ({
  enabled: paymentsEnabled,
  keyId: env.RAZORPAY_KEY_ID ?? null,
});
