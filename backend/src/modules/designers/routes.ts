import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, param, created, noContent, ok } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireDesigner } from '../../middleware/auth.js';
import { designerService } from './service.js';

const router: Router = Router();

const createProfileSchema = z.object({
  studioName: z.string().trim().min(2, 'Give your studio a name.').max(80),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().max(60).nullish(),
  bio: z.string().trim().max(2000).nullish(),
  specialties: z.array(z.string().trim().max(60)).max(12).default([]),
  crafts: z.array(z.string().trim().max(60)).max(12).default([]),
  fabricSkills: z.array(z.string().trim().max(60)).max(12).default([]),
  leadTimeMinDays: z.number().int().min(1).max(120).optional(),
  leadTimeMaxDays: z.number().int().min(1).max(180).optional(),
});

const updateProfileSchema = createProfileSchema.partial().extend({
  capacityPercent: z.number().int().min(0).max(100).optional(),
  maxActiveOrders: z.number().int().min(1).max(50).optional(),
  isAcceptingWork: z.boolean().optional(),
  minOrderValue: z.number().int().positive().nullish(),
  serviceAreas: z.array(z.string().trim().max(20)).max(60).optional(),
  coverUrl: z.string().url().nullish(),
  logoUrl: z.string().url().nullish(),
});

const portfolioSchema = z.object({
  title: z.string().trim().min(1, 'Give this piece a name.').max(120),
  description: z.string().trim().max(1000).nullish(),
  imageUrls: z.array(z.string().url()).min(1, 'Add at least one image.').max(10),
});

const portfolioUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullish(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  category: z.string().trim().max(60).nullish(),
  occasion: z.string().trim().max(60).nullish(),
  fabric: z.string().trim().max(80).nullish(),
  embroidery: z.string().trim().max(80).nullish(),
  palette: z.array(z.string().trim().max(40)).max(8).optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

const payoutSchema = z.object({
  accountHolder: z.string().trim().min(2).max(120),
  accountLast4: z.string().trim().regex(/^\d{4}$/, 'Enter the last 4 digits.'),
  ifsc: z.string().trim().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code.'),
  bankName: z.string().trim().max(120).nullish(),
  upiId: z.string().trim().max(120).nullish(),
});

const verificationSchema = z.object({
  documents: z
    .array(z.object({ type: z.string().max(40), url: z.string().url() }))
    .min(1, 'Attach at least one document.')
    .max(6),
});

/** POST /api/designers/profile �?" the "Build your studio" flow. */
router.post(
  '/profile',
  requireAuth,
  validate(createProfileSchema),
  asyncHandler(async (req, res) =>
    created(res, await designerService.createProfile(req.user!.id, req.body)),
  ),
);

router.use(requireDesigner);

router.get(
  '/profile',
  asyncHandler(async (req, res) =>
    ok(res, await designerService.getOwnProfile(req.user!.designerId!)),
  ),
);

router.patch(
  '/profile',
  validate(updateProfileSchema),
  asyncHandler(async (req, res) =>
    ok(res, await designerService.updateProfile(req.user!.designerId!, req.body)),
  ),
);

router.post(
  '/profile/publish',
  asyncHandler(async (req, res) => ok(res, await designerService.publish(req.user!.designerId!))),
);

router.post(
  '/portfolio',
  validate(portfolioSchema),
  asyncHandler(async (req, res) =>
    created(res, await designerService.addPortfolioItem(req.user!.designerId!, req.body)),
  ),
);

router.patch(
  '/portfolio/:itemId',
  validate(portfolioUpdateSchema),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await designerService.updatePortfolioItem(
        req.user!.designerId!,
        param(req, 'itemId'),
        req.body,
      ),
    ),
  ),
);

router.delete(
  '/portfolio/:itemId',
  asyncHandler(async (req, res) => {
    await designerService.deletePortfolioItem(req.user!.designerId!, param(req, 'itemId'));
    return noContent(res);
  }),
);

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => ok(res, await designerService.dashboard(req.user!.designerId!))),
);

router.get(
  '/copilot',
  asyncHandler(async (req, res) => ok(res, await designerService.copilot(req.user!.designerId!))),
);

router.get(
  '/earnings',
  asyncHandler(async (req, res) => ok(res, await designerService.earnings(req.user!.designerId!))),
);

router.put(
  '/payout-account',
  validate(payoutSchema),
  asyncHandler(async (req, res) =>
    ok(res, await designerService.savePayoutAccount(req.user!.designerId!, req.body)),
  ),
);

router.post(
  '/verification',
  validate(verificationSchema),
  asyncHandler(async (req, res) =>
    created(
      res,
      await designerService.submitVerification(req.user!.designerId!, req.body.documents),
    ),
  ),
);

export default router;
