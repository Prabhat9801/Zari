import { API_URL, apiUrl, isApiConfigured } from './config';
import { session } from './session';

/**
 * The single place the frontend talks to the API.
 *
 * Responsibilities kept here so no component ever does its own fetch:
 *  - attaches the bearer token and the guest token
 *  - unwraps the { data } / { error } envelope the backend always returns
 *  - refreshes an expired access token once, then replays the request
 *  - turns every failure into an ApiError carrying a human-readable message
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly alternatives: string[];
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: { alternatives?: string[]; details?: unknown },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.alternatives = options?.alternatives ?? [];
    this.details = options?.details;
  }

  /** True when the API is simply unreachable, as opposed to rejecting us. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

/** Thrown when a design edit cannot be reliably stitched. */
export const isUnmanufacturable = (err: unknown): err is ApiError =>
  err instanceof ApiError && err.code === 'UNMANUFACTURABLE';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skip the refresh-and-retry dance (used by the refresh call itself). */
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

interface Envelope<T> {
  data?: T;
  error?: { code: string; message: string; alternatives?: string[]; details?: unknown };
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = session.refreshToken;
  if (!refreshToken) return false;

  // Collapse concurrent 401s into one refresh so we don't burn the rotating
  // refresh token several times over.
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        session.clear();
        return false;
      }
      const payload = (await res.json()) as Envelope<{
        accessToken: string;
        refreshToken: string;
        user: Parameters<typeof session.save>[1];
      }>;
      if (!payload.data) {
        session.clear();
        return false;
      }
      session.save(
        { accessToken: payload.data.accessToken, refreshToken: payload.data.refreshToken },
        payload.data.user,
      );
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!isApiConfigured) {
    throw new ApiError(0, 'NO_API', 'Zari is running on demo data.');
  }

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const accessToken = session.accessToken;
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  const guestToken = session.guestToken;
  if (guestToken) headers['x-guest-token'] = guestToken;

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch {
    throw new ApiError(0, 'OFFLINE', "Zari couldn't reach the server. Check your connection.");
  }

  if (res.status === 401 && !options.skipRefresh && session.refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, { ...options, skipRefresh: true });
  }

  if (res.status === 204) return undefined as T;

  let payload: Envelope<T>;
  try {
    payload = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(res.status, 'BAD_RESPONSE', "Zari couldn't read that response. Try again.");
  }

  if (!res.ok || payload.error) {
    const error = payload.error;
    throw new ApiError(
      res.status,
      error?.code ?? 'ERROR',
      error?.message ?? "Zari couldn't finish that. Nothing is lost — try again.",
      { alternatives: error?.alternatives, details: error?.details },
    );
  }

  return payload.data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Liveness probe used to decide whether to show real data or the demo set. */
export async function pingApi(): Promise<boolean> {
  if (!isApiConfigured) return false;
  try {
    const res = await fetch(`${API_URL}/api/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
