import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, created } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';
import { requireIdentity } from '../../middleware/auth.js';
import { createSignedUpload, type UploadFolder } from '../../services/storage.js';

const router: Router = Router();

const signSchema = z.object({
  folder: z.enum([
    'inspiration',
    'designs',
    'portfolio',
    'qc',
    'avatars',
    'disputes',
    'verification',
  ]),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  sizeBytes: z.number().int().positive().max(12 * 1024 * 1024),
});

/**
 * POST /api/uploads/sign
 * Returns a short-lived signed URL. The browser PUTs the file straight to
 * Supabase Storage and then sends us the resulting publicUrl — image bytes
 * never pass through this API.
 */
router.post(
  '/sign',
  requireIdentity,
  validate(signSchema),
  asyncHandler(async (req, res) => {
    const ownerId = req.user?.id ?? req.guestToken ?? 'anonymous';
    const body = req.body as z.infer<typeof signSchema>;
    return created(
      res,
      await createSignedUpload(
        body.folder as UploadFolder,
        ownerId,
        body.contentType,
        body.sizeBytes,
      ),
    );
  }),
);

export default router;
