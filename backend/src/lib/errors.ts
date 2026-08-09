/**
 * Every error the API returns is human-readable. The frontend renders
 * `message` directly to the user, so it must never contain a stack trace,
 * a SQL fragment, or the word "Internal Server Error".
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  /** Optional next actions the UI can render as buttons. */
  readonly alternatives?: string[];

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: { details?: unknown; alternatives?: string[] },
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options?.details;
    this.alternatives = options?.alternatives;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, { details });

export const unauthorized = (message = 'Please sign in to continue.') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (what = 'That') =>
  new AppError(404, 'NOT_FOUND', `${what} could not be found.`);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, { details });

export const tooMany = (message = 'Too many attempts. Please wait a moment.') =>
  new AppError(429, 'RATE_LIMITED', message);

export const unprocessable = (message: string, alternatives?: string[]) =>
  new AppError(422, 'UNPROCESSABLE', message, { alternatives });

/** The design edit can't be reliably stitched by the designer network. */
export const unmanufacturable = (message: string, alternatives: string[]) =>
  new AppError(422, 'UNMANUFACTURABLE', message, { alternatives });

export const upstreamFailure = (message = "Zari couldn't finish that. Nothing is lost — try again.") =>
  new AppError(502, 'UPSTREAM_FAILURE', message);
