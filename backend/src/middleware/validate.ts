import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { badRequest } from '../lib/errors.js';

type Source = 'body' | 'query' | 'params';

/**
 * Validates and REPLACES the request part with the parsed value, so handlers
 * receive coerced, defaulted, stripped data rather than raw input.
 */
export function validate<S extends ZodTypeAny>(schema: S, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      const first = details[0];
      return next(
        badRequest(
          first ? `${first.field ? `${first.field}: ` : ''}${first.message}` : 'That input is not valid.',
          details,
        ),
      );
    }
    // Express 5 makes req.query a getter-only property, so assign via defineProperty.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}

export type Infer<S extends ZodTypeAny> = z.infer<S>;
