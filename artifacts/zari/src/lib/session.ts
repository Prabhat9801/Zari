/**
 * Token storage.
 *
 * The guest token is the important one: a visitor gets it before signing up,
 * every design they create is attached to it, and on signup it is handed to the
 * backend so those designs move into the new account. Losing it loses their work,
 * so it is persisted the moment it is issued.
 */

const ACCESS_KEY = 'zari.accessToken';
const REFRESH_KEY = 'zari.refreshToken';
const GUEST_KEY = 'zari.guestToken';
const USER_KEY = 'zari.user';

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: 'CUSTOMER' | 'DESIGNER' | 'OPS' | 'ADMIN';
  avatarUrl: string | null;
  designerId: string | null;
}

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private browsing or storage disabled — degrade to an in-memory session.
    return null;
  }
};

const write = (key: string, value: string | null): void => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

export const session = {
  get accessToken(): string | null {
    return read(ACCESS_KEY);
  },
  get refreshToken(): string | null {
    return read(REFRESH_KEY);
  },
  get guestToken(): string | null {
    return read(GUEST_KEY);
  },

  get user(): SessionUser | null {
    const raw = read(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionUser;
    } catch {
      return null;
    }
  },

  get isSignedIn(): boolean {
    return Boolean(read(ACCESS_KEY));
  },

  setGuestToken(token: string): void {
    write(GUEST_KEY, token);
  },

  save(tokens: { accessToken: string; refreshToken: string }, user: SessionUser): void {
    write(ACCESS_KEY, tokens.accessToken);
    write(REFRESH_KEY, tokens.refreshToken);
    write(USER_KEY, JSON.stringify(user));
  },

  setAccessToken(token: string): void {
    write(ACCESS_KEY, token);
  },

  /** Clears the account but KEEPS the guest token, so unclaimed work survives. */
  clear(): void {
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
    write(USER_KEY, null);
  },
};
