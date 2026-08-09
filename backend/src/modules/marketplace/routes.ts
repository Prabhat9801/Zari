import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, param, created, ok } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireDesigner } from '../../middleware/auth.js';
import { matchWeights } from '../../services/matching.js';
import { qualityWeights } from '../../services/qualityScore.js';
import { marketplaceService } from './service.js';

const router: Router = Router();

const createRequestSchema = z.object({
  designId: z.string().cuid(),
  versionId: z.string().cuid().optional(),
  budgetMin: z.number().int().positive().nullish(),
  budgetMax: z.number().int().positive().nullish(),
  neededBy: z.string().datetime().nullish(),
  city: z.string().trim().max(80).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

const bidSchema = z.object({
  price: z.number().int().positive('Enter your quote.'),
  leadTimeDays: z.number().int().min(1).max(180),
  message: z.string().trim().max(2000).nullish(),
  proposedModification: z.string().trim().max(1000).nullish(),
  proposedPriceDelta: z.number().int().nullish(),
  portfolioRefs: z.array(z.string().cuid()).max(6).default([]),
});

const browseSchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  city: z.string().trim().max(80).optional(),
  specialty: z.string().trim().max(80).optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(['quality', 'leadTime', 'rating']).default('quality'),
});

const pageSchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// --- Public directory -------------------------------------------------------

router.get(
  '/designers',
  validate(browseSchema, 'query'),
  asyncHandler(async (req, res) =>
    ok(res, await marketplaceService.browseDesigners(req.query as never)),
  ),
);

router.get(
  '/designers/:slug',
  asyncHandler(async (req, res) =>
    ok(res, await marketplaceService.getDesignerPublic(param(req, 'slug'))),
  ),
);

/**
 * The "How is this score calculated?" endpoint. Exposing the weights is the
 * point — an opaque score is not a trust feature.
 */
router.get('/scoring', (_req, res) =>
  ok(res, {
    qualityScore: {
      weights: qualityWeights,
      components: [
        { key: 'craftSkill', label: 'Craft skill', source: 'Customer reviews of finished work' },
        { key: 'pastSuccess', label: 'Past success', source: 'Orders that passed QC first time' },
        { key: 'onTimeDelivery', label: 'On-time delivery', source: 'Delivered by the promised date' },
        { key: 'communication', label: 'Communication', source: 'Customer ratings for responsiveness' },
        { key: 'customerRating', label: 'Customer rating', source: 'Overall review score' },
      ],
      note: 'Placement is never paid for. Price is not part of the Quality Score.',
    },
    matching: {
      weights: matchWeights,
      note: 'Designers are ranked on fit and quality, not on the lowest price.',
    },
  }),
);

// --- Customer side ----------------------------------------------------------

router.post(
  '/requests',
  requireAuth,
  validate(createRequestSchema),
  asyncHandler(async (req, res) =>
    created(res, await marketplaceService.createRequest(req.user!.id, req.body)),
  ),
);

router.get(
  '/requests/:requestId/matches',
  requireAuth,
  asyncHandler(async (req, res) =>
    ok(res, await marketplaceService.listMatches(param(req, 'requestId'), req.user!.id)),
  ),
);

router.get(
  '/requests/:requestId/bids',
  requireAuth,
  asyncHandler(async (req, res) =>
    ok(res, await marketplaceService.listBids(param(req, 'requestId'), req.user!.id)),
  ),
);

// --- Designer side ----------------------------------------------------------

router.get(
  '/opportunities',
  requireDesigner,
  validate(pageSchema, 'query'),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await marketplaceService.listDesignerOpportunities(
        req.user!.designerId!,
        req.query as never,
      ),
    ),
  ),
);

router.post(
  '/requests/:requestId/bids',
  requireDesigner,
  validate(bidSchema),
  asyncHandler(async (req, res) =>
    created(
      res,
      await marketplaceService.submitBid(
        req.user!.designerId!,
        param(req, 'requestId'),
        req.body,
      ),
    ),
  ),
);

router.get(
  '/bids',
  requireDesigner,
  validate(pageSchema, 'query'),
  asyncHandler(async (req, res) =>
    ok(res, await marketplaceService.listDesignerBids(req.user!.designerId!, req.query as never)),
  ),
);

router.post(
  '/bids/:bidId/withdraw',
  requireDesigner,
  asyncHandler(async (req, res) =>
    ok(res, await marketplaceService.withdrawBid(param(req, 'bidId'), req.user!.designerId!)),
  ),
);

export default router;
