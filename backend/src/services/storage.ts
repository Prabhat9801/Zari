import { request } from 'undici';
import crypto from 'node:crypto';
import { env, storageEnabled } from '../config/env.js';
import { badRequest, upstreamFailure } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Supabase Storage. The backend never proxies file bytes — it mints a signed
 * upload URL, the browser PUTs directly to Supabase, then tells us the path.
 * That keeps large image uploads off the API dyno entirely.
 */

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_BYTES = 12 * 1024 * 1024;

export type UploadFolder =
  | 'inspiration'
  | 'designs'
  | 'portfolio'
  | 'qc'
  | 'avatars'
  | 'disputes'
  | 'verification';

export interface SignedUpload {
  uploadUrl: string;
  token: string;
  path: string;
  publicUrl: string;
  expiresInSeconds: number;
}

export function assertUploadAllowed(contentType: string, sizeBytes: number): void {
  if (!ALLOWED.has(contentType)) {
    throw badRequest('That file type is not supported. Use a JPG, PNG, WebP or AVIF image.');
  }
  if (sizeBytes > MAX_BYTES) {
    throw badRequest('That image is larger than 12 MB. Try a smaller export.');
  }
}

function extensionFor(contentType: string): string {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }[
    contentType
  ] ?? 'bin';
}

export function buildPath(folder: UploadFolder, ownerId: string, contentType: string): string {
  const id = crypto.randomBytes(12).toString('hex');
  return `${folder}/${ownerId}/${Date.now()}-${id}.${extensionFor(contentType)}`;
}

export function publicUrlFor(path: string): string {
  return `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/${path}`;
}

export async function createSignedUpload(
  folder: UploadFolder,
  ownerId: string,
  contentType: string,
  sizeBytes: number,
): Promise<SignedUpload> {
  assertUploadAllowed(contentType, sizeBytes);

  if (!storageEnabled) {
    throw upstreamFailure('Image uploads are not configured on this environment yet.');
  }

  const path = buildPath(folder, ownerId, contentType);
  const endpoint = `${env.SUPABASE_URL}/storage/v1/object/upload/sign/${env.SUPABASE_STORAGE_BUCKET}/${path}`;

  try {
    const res = await request(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 900 }),
    });

    const text = await res.body.text();
    if (res.statusCode >= 400) {
      logger.error({ status: res.statusCode, text }, 'Supabase signed upload failed');
      throw upstreamFailure('We could not start that upload. Please try again.');
    }

    const parsed = JSON.parse(text) as { url?: string; token?: string };
    const token = parsed.token ?? '';

    return {
      uploadUrl: `${env.SUPABASE_URL}/storage/v1${parsed.url ?? ''}`,
      token,
      path,
      publicUrl: publicUrlFor(path),
      expiresInSeconds: 900,
    };
  } catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err) throw err;
    logger.error({ err }, 'Supabase signed upload threw');
    throw upstreamFailure('We could not start that upload. Please try again.');
  }
}

export async function deleteObject(path: string): Promise<void> {
  if (!storageEnabled) return;
  try {
    await request(
      `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}/${path}`,
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      },
    );
  } catch (err) {
    logger.warn({ err, path }, 'Failed to delete storage object');
  }
}
