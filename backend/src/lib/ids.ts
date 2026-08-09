import { customAlphabet } from 'nanoid';
import crypto from 'node:crypto';

const digits = customAlphabet('0123456789', 4);

/** Human-facing order code: ZR-1048 */
export const orderCode = (): string => `ZR-${digits()}`;

/** Human-facing design request code: ZRQ-1048 */
export const requestCode = (): string => `ZRQ-${digits()}`;

/** Opaque token given to a guest visitor so their designs survive until signup. */
export const guestToken = (): string => `gst_${crypto.randomBytes(24).toString('base64url')}`;

/** 6-digit OTP. Uses the CSPRNG — never Math.random for anything auth-adjacent. */
export const otpCode = (): string => String(crypto.randomInt(100_000, 1_000_000));

export const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');

/** URL-safe studio slug: "Mira Atelier" -> "mira-atelier" */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
