import { Router } from 'express';
import { asyncHandler, param, created, noContent, ok } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireIdentity } from '../../middleware/auth.js';
import { aiLimiter } from '../../middleware/rateLimit.js';
import { designService, type Identity } from './service.js';
import {
  compareVersionsSchema,
  editDesignSchema,
  generateDesignSchema,
  listDesignsSchema,
  updateDesignSchema,
} from './schema.js';

const router: Router = Router();

const identityOf = (req: { user?: { id: string }; guestToken?: string }): Identity => ({
  userId: req.user?.id ?? null,
  guestToken: req.guestToken ?? null,
});

/** POST /api/designs/generate — brief -> up to 4 manufacturable concepts. */
router.post(
  '/generate',
  requireIdentity,
  aiLimiter,
  validate(generateDesignSchema),
  asyncHandler(async (req, res) =>
    created(res, await designService.generate(req.body, identityOf(req))),
  ),
);

router.get(
  '/jobs/:jobId',
  requireIdentity,
  asyncHandler(async (req, res) => ok(res, await designService.getJob(param(req, 'jobId')))),
);

router.get(
  '/',
  requireIdentity,
  validate(listDesignsSchema, 'query'),
  asyncHandler(async (req, res) =>
    ok(res, await designService.list(req.query as never, identityOf(req))),
  ),
);

router.get(
  '/:designId',
  requireIdentity,
  asyncHandler(async (req, res) =>
    ok(res, await designService.get(param(req, 'designId'), identityOf(req))),
  ),
);

router.patch(
  '/:designId',
  requireIdentity,
  validate(updateDesignSchema),
  asyncHandler(async (req, res) =>
    ok(res, await designService.update(param(req, 'designId'), req.body, identityOf(req))),
  ),
);

router.delete(
  '/:designId',
  requireIdentity,
  asyncHandler(async (req, res) => {
    await designService.remove(param(req, 'designId'), identityOf(req));
    return noContent(res);
  }),
);

router.post(
  '/:designId/duplicate',
  requireIdentity,
  asyncHandler(async (req, res) =>
    created(res, await designService.duplicate(param(req, 'designId'), identityOf(req))),
  ),
);

/** POST /api/designs/:id/edit — conversational edit, always a new version. */
router.post(
  '/:designId/edit',
  requireIdentity,
  aiLimiter,
  validate(editDesignSchema),
  asyncHandler(async (req, res) =>
    created(res, await designService.edit(param(req, 'designId'), req.body, identityOf(req))),
  ),
);

router.get(
  '/:designId/versions/compare',
  requireIdentity,
  validate(compareVersionsSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { a, b } = req.query as unknown as { a: string; b: string };
    return ok(res, await designService.compare(param(req, 'designId'), a, b, identityOf(req)));
  }),
);

router.get(
  '/:designId/versions/:versionId',
  requireIdentity,
  asyncHandler(async (req, res) =>
    ok(
      res,
      await designService.getVersion(
        param(req, 'designId'),
        param(req, 'versionId'),
        identityOf(req),
      ),
    ),
  ),
);

/** Undo / redo / jump-to-version all route through here. */
router.post(
  '/:designId/versions/:versionId/activate',
  requireIdentity,
  asyncHandler(async (req, res) =>
    ok(
      res,
      await designService.setCurrentVersion(
        param(req, 'designId'),
        param(req, 'versionId'),
        identityOf(req),
      ),
    ),
  ),
);

export default router;
