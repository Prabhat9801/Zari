import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export interface AuthUser {
  id: string;
  role: UserRole;
  isGuest: boolean;
  designerId?: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      guestToken?: string;
      /** A bearer token was supplied but is expired or invalid. */
      staleToken?: boolean;
    }
  }
}

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  isGuest: boolean;
  designerId?: string | null;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'zari',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'zari' }) as AccessTokenPayload;
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/**
 * Populates req.user when a valid token is present, and req.guestToken from the
 * X-Guest-Token header. Never rejects — routes decide what they require.
 * This is what lets a visitor use the Design Studio without signing up.
 */
export function attachIdentity(req: Request, _res: Response, next: NextFunction): void {
  const guest = req.headers['x-guest-token'];
  if (typeof guest === 'string' && guest.length > 0) req.guestToken = guest;

  const token = readToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      isGuest: payload.isGuest,
      designerId: payload.designerId ?? null,
    };
  } catch {
    // Someone presented a token, so they are claiming an identity — do NOT
    // silently demote them to a guest. That is how a signed-in customer whose
    // 15-minute access token lapsed ended up refused by the guest quota with a
    // 403, which the client never refreshes on. Flag it here; the guards below
    // turn it into a 401, and the client refreshes and replays the request.
    req.staleToken = true;
  }
  next();
}

/** 401 tells the client to refresh; anything else leaves it stuck. */
const sessionExpired = () =>
  unauthorized('Your session timed out. Signing you back in — please try again.');

/** Requires a real, signed-in account. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (req.staleToken) return next(sessionExpired());
  if (!req.user) return next(unauthorized());
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.staleToken) return next(sessionExpired());
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden('This area is for a different kind of account.'));
    }
    next();
  };
}

/** A designer route also needs a designer profile to exist. */
export function requireDesigner(req: Request, _res: Response, next: NextFunction): void {
  if (req.staleToken) return next(sessionExpired());
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'DESIGNER' && req.user.role !== 'ADMIN') {
    return next(forbidden('Create a designer studio to access this.'));
  }
  if (!req.user.designerId && req.user.role === 'DESIGNER') {
    return next(forbidden('Finish setting up your studio profile first.'));
  }
  next();
}

/**
 * Requires either a signed-in user or a guest token. Used by the Design Studio,
 * where a visitor gets one free generation before being asked to sign up.
 */
export function requireIdentity(req: Request, _res: Response, next: NextFunction): void {
  // Checked before the guest fallback on purpose: a signed-in customer with a
  // lapsed token must refresh, not quietly become a guest and then be turned
  // away by the guest quota.
  if (req.staleToken) return next(sessionExpired());
  if (!req.user && !req.guestToken) {
    return next(unauthorized('Start a design to continue.'));
  }
  next();
}
