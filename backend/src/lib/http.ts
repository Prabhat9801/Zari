import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export const asyncHandler =
  <T>(fn: (req: Request, res: Response, next: NextFunction) => Promise<T>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res, next).catch(next);
  };

/**
 * Express 5 types route params as `string | string[]` because of the wildcard
 * syntax. Every param we declare is a single segment, so this narrows once
 * here instead of casting at ~40 call sites.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export const ok = <T>(res: Response, data: T) => res.status(200).json({ data });

export const created = <T>(res: Response, data: T) => res.status(201).json({ data });

export const noContent = (res: Response) => res.status(204).end();

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Cursor pagination. We over-fetch by one row to learn whether another page
 * exists without a second COUNT query.
 */
export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    hasMore,
  };
}

export const cursorArgs = (cursor: string | undefined, limit: number) => ({
  take: limit + 1,
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
});
