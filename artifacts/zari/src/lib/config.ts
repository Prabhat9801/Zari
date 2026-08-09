/**
 * Where the API lives.
 *
 * Set VITE_API_URL at build time (Render -> Static Site -> Environment).
 * When it is empty the app runs in DEMO MODE: every screen falls back to the
 * bundled mock data and no network calls are made. That is deliberate — the
 * site should still be presentable before the backend exists.
 */
const raw = import.meta.env.VITE_API_URL as string | undefined;

export const API_URL = (raw ?? '').replace(/\/+$/, '');

export const isApiConfigured = API_URL.length > 0;

/** Full URL for an API path: apiUrl('/designs') -> https://host/api/designs */
export const apiUrl = (path: string): string =>
  `${API_URL}/api${path.startsWith('/') ? path : `/${path}`}`;

/** How long a successful response stays fresh before refetching. */
export const DEFAULT_STALE_TIME = 30_000;
