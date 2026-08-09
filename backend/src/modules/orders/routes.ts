import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, param, created, ok } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { orderService } from './service.js';

const router: Router = Router();

const acceptBidSchema = z.object({
  bidId: z.string().cuid(),
  measurementId: z.string().cuid().nullish(),
  addressId: z.string().cuid().nullish(),
});

const listSchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.string().max(30).optional(),
  as: z.enum(['customer', 'designer']).optional(),
});

const milestoneSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'SKIPPED']).optional(),
  note: z.string().trim().max(1000).nullish(),
  photoUrls: z.array(z.string().url()).max(8).optional(),
});

const fitSchema = z.object({
  rating: z.enum(['PERFECT', 'SLIGHT_ALTERATION', 'NEEDS_ALTERATION', 'MAJOR_ISSUE']),
  note: z.string().trim().max(1000).nullish(),
  photoUrls: z.array(z.string().url()).max(8).optional(),
});

const alterationSchema = z.object({
  description: z.string().trim().min(4, 'Tell the designer what needs adjusting.').max(1000),
  photoUrls: z.array(z.string().url()).max(8).optional(),
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).nullish(),
  body: z.string().trim().max(3000).nullish(),
  aspects: z.record(z.number().min(1).max(5)).optional(),
  photoUrls: z.array(z.string().url()).max(8).optional(),
});

router.use(requireAuth);

/** POST /api/orders �?" accept a bid. Creates the order in PENDING_PAYMENT. */
router.post(
  '/',
  validate(acceptBidSchema),
  asyncHandler(async (req, res) =>
    created(
      res,
      await orderService.acceptBid(req.user!.id, req.body.bidId, {
        measurementId: req.body.measurementId,
        addressId: req.body.addressId,
      }),
    ),
  ),
);

router.get(
  '/',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => ok(res, await orderService.list(req.user!, req.query as never))),
);

router.get(
  '/:orderId',
  asyncHandler(async (req, res) => ok(res, await orderService.get(param(req, 'orderId'), req.user!))),
);

router.patch(
  '/:orderId/milestones/:milestoneId',
  validate(milestoneSchema),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await orderService.updateMilestone(
        param(req, 'orderId'),
        param(req, 'milestoneId'),
        req.user!,
        req.body,
      ),
    ),
  ),
);

router.post(
  '/:orderId/ship',
  asyncHandler(async (req, res) =>
    ok(res, await orderService.markShipped(param(req, 'orderId'), req.user!)),
  ),
);

router.post(
  '/:orderId/deliver',
  asyncHandler(async (req, res) =>
    ok(res, await orderService.markDelivered(param(req, 'orderId'), req.user!)),
  ),
);

/** The "How does it fit?" prompt after delivery. */
router.post(
  '/:orderId/fit',
  validate(fitSchema),
  asyncHandler(async (req, res) =>
    created(res, await orderService.submitFitFeedback(param(req, 'orderId'), req.user!.id, req.body)),
  ),
);

router.post(
  '/:orderId/alterations',
  validate(alterationSchema),
  asyncHandler(async (req, res) =>
    created(res, await orderService.requestAlteration(param(req, 'orderId'), req.user!.id, req.body)),
  ),
);

router.post(
  '/:orderId/review',
  validate(reviewSchema),
  asyncHandler(async (req, res) =>
    created(res, await orderService.leaveReview(param(req, 'orderId'), req.user!.id, req.body)),
  ),
);

export default router;
