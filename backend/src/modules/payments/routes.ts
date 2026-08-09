import { Router, raw } from 'express';
import { z } from 'zod';
import { asyncHandler, param, created, ok } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { verifyWebhookSignature, publicPaymentConfig } from '../../services/payments.js';
import { logger } from '../../lib/logger.js';
import { paymentService } from './service.js';

const router: Router = Router();

const intentSchema = z.object({
  orderId: z.string().cuid(),
  type: z.enum(['ADVANCE', 'BALANCE']).default('ADVANCE'),
});

const confirmSchema = z.object({
  providerPaymentId: z.string().min(4),
  signature: z.string().min(16),
});

/**
 * Razorpay webhook. Mounted with a raw body parser because the HMAC is computed
 * over the exact bytes �?" a re-serialised JSON body would never verify.
 * This route is registered before express.json() in app.ts.
 */
router.post(
  '/webhook',
  raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

    if (typeof signature !== 'string' || !verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Rejected webhook with a bad signature');
      res.status(400).json({ error: { code: 'BAD_SIGNATURE', message: 'Invalid signature.' } });
      return;
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const eventId =
      (req.headers['x-razorpay-event-id'] as string | undefined) ??
      `${payload.event as string}:${Date.now()}`;

    await paymentService.handleWebhook(eventId, String(payload.event), payload);

    // Always 200 once the signature is valid �?" a non-2xx makes Razorpay retry
    // an event we have already recorded.
    res.status(200).json({ received: true });
  }),
);

router.get('/config', (_req, res) => ok(res, publicPaymentConfig()));

router.use(requireAuth);

router.post(
  '/intents',
  validate(intentSchema),
  asyncHandler(async (req, res) =>
    created(res, await paymentService.createIntent(req.body.orderId, req.user!.id, req.body.type)),
  ),
);

router.post(
  '/:paymentId/confirm',
  validate(confirmSchema),
  asyncHandler(async (req, res) =>
    ok(res, await paymentService.confirm(param(req, 'paymentId'), req.user!.id, req.body)),
  ),
);

router.get(
  '/orders/:orderId/escrow',
  asyncHandler(async (req, res) =>
    ok(res, await paymentService.escrowSummary(param(req, 'orderId'), req.user!.id)),
  ),
);

export default router;
