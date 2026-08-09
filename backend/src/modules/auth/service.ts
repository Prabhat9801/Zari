import argon2 from 'argon2';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { badRequest, conflict, tooMany, unauthorized } from '../../lib/errors.js';
import { guestToken as newGuestToken, otpCode, randomToken, sha256 } from '../../lib/ids.js';
import { signAccessToken } from '../../middleware/auth.js';
import { sendOtpSms } from '../../services/otp.js';
import { logger } from '../../lib/logger.js';
import type {
  EmailLoginInput,
  EmailSignupInput,
  RequestOtpInput,
  VerifyOtpInput,
} from './schema.js';

const OTP_TTL_MINUTES = 10;

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    role: User['role'];
    avatarUrl: string | null;
    designerId: string | null;
  };
  claimedDesigns: number;
}

async function issueSession(
  user: User,
  meta: { userAgent?: string; ip?: string },
  claimedDesigns = 0,
): Promise<Session> {
  const designer = await prisma.designerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  const refreshToken = randomToken(48);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    accessToken: signAccessToken({
      sub: user.id,
      role: user.role,
      isGuest: user.isGuest,
      designerId: designer?.id ?? null,
    }),
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatarUrl: user.avatarUrl,
      designerId: designer?.id ?? null,
    },
    claimedDesigns,
  };
}

/**
 * Moves every design created under a guest token into the new account. This is
 * what makes the "your guest design appears in your account" moment work.
 */
async function claimGuestDesigns(userId: string, token?: string): Promise<number> {
  if (!token) return 0;
  const result = await prisma.design.updateMany({
    where: { guestToken: token, ownerId: null },
    data: { ownerId: userId, guestToken: null, claimedAt: new Date() },
  });
  if (result.count > 0) {
    logger.info({ userId, count: result.count }, 'Claimed guest designs');
  }
  return result.count;
}

export const authService = {
  /** Issues an anonymous token so a visitor can use the studio before signing up. */
  createGuestToken(): { guestToken: string; freeGenerations: number } {
    return { guestToken: newGuestToken(), freeGenerations: env.GUEST_FREE_GENERATIONS };
  },

  async requestOtp(input: RequestOtpInput): Promise<{ sent: true; expiresInSeconds: number }> {
    const recent = await prisma.otpChallenge.count({
      where: {
        phone: input.phone,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
    });
    if (recent >= 2) throw tooMany('We just sent a code. Please wait a minute before retrying.');

    const code = otpCode();
    await prisma.otpChallenge.create({
      data: {
        phone: input.phone,
        codeHash: sha256(code),
        purpose: input.purpose,
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
      },
    });

    await sendOtpSms(input.phone, code);
    return { sent: true, expiresInSeconds: OTP_TTL_MINUTES * 60 };
  },

  async verifyOtp(
    input: VerifyOtpInput,
    meta: { userAgent?: string; ip?: string },
  ): Promise<Session> {
    const challenge = await prisma.otpChallenge.findFirst({
      where: { phone: input.phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) throw badRequest('That code has expired. Ask for a new one.');
    if (challenge.attempts >= challenge.maxAttempts) {
      throw tooMany('Too many wrong attempts. Request a fresh code.');
    }

    if (challenge.codeHash !== sha256(input.code)) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw badRequest("That code doesn't match. Check and try again.");
    }

    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    let user = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: input.phone,
          name: input.name ?? null,
          phoneVerifiedAt: new Date(),
          customerProfile: { create: {} },
        },
      });
    } else if (!user.phoneVerifiedAt) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { phoneVerifiedAt: new Date() },
      });
    }

    const claimed = await claimGuestDesigns(user.id, input.guestToken);
    return issueSession(user, meta, claimed);
  },

  async signupWithEmail(
    input: EmailSignupInput,
    meta: { userAgent?: string; ip?: string },
  ): Promise<Session> {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw conflict('An account already exists with that email. Try signing in.');

    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash: await argon2.hash(input.password),
        customerProfile: input.role === 'CUSTOMER' ? { create: {} } : undefined,
      },
    });

    const claimed = await claimGuestDesigns(user.id, input.guestToken);
    return issueSession(user, meta, claimed);
  },

  async loginWithEmail(
    input: EmailLoginInput,
    meta: { userAgent?: string; ip?: string },
  ): Promise<Session> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    // Same message for "no such user" and "wrong password" — do not leak which.
    if (!user?.passwordHash) throw unauthorized('That email and password do not match.');
    if (user.status !== 'ACTIVE') throw unauthorized('This account is not active.');

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) throw unauthorized('That email and password do not match.');

    const claimed = await claimGuestDesigns(user.id, input.guestToken);
    return issueSession(user, meta, claimed);
  },

  /** Rotating refresh: the old token is revoked the moment a new one is issued. */
  async refresh(token: string, meta: { userAgent?: string; ip?: string }): Promise<Session> {
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw unauthorized('Your session has expired. Please sign in again.');
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return issueSession(stored.user, meta);
  },

  async logout(token: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  claimGuestDesigns,
};
