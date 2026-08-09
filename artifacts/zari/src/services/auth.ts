import { api } from '@/lib/apiClient';
import { session, type SessionUser } from '@/lib/session';

interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
  claimedDesigns: number;
}

export const authService = {
  /**
   * Issues a guest token if we don't already have one, so a visitor can use the
   * Design Studio before signing up. Called once on app boot.
   */
  async ensureGuest(): Promise<void> {
    if (session.guestToken || session.isSignedIn) return;
    const result = await api.post<{ guestToken: string; freeGenerations: number }>('/auth/guest');
    session.setGuestToken(result.guestToken);
  },

  /**
   * Signup passes the guest token along so designs made before the account
   * existed move into it. `claimedDesigns` is what the welcome screen counts.
   */
  async signup(input: { email: string; password: string; name: string }): Promise<SessionResponse> {
    const result = await api.post<SessionResponse>('/auth/signup', {
      ...input,
      guestToken: session.guestToken ?? undefined,
    });
    session.save(result, result.user);
    return result;
  },

  async login(input: { email: string; password: string }): Promise<SessionResponse> {
    const result = await api.post<SessionResponse>('/auth/login', {
      ...input,
      guestToken: session.guestToken ?? undefined,
    });
    session.save(result, result.user);
    return result;
  },

  async requestOtp(phone: string) {
    return api.post<{ sent: true; expiresInSeconds: number }>('/auth/otp/request', {
      phone,
      purpose: 'LOGIN',
    });
  },

  async verifyOtp(input: { phone: string; code: string; name?: string }): Promise<SessionResponse> {
    const result = await api.post<SessionResponse>('/auth/otp/verify', {
      ...input,
      guestToken: session.guestToken ?? undefined,
    });
    session.save(result, result.user);
    return result;
  },

  async me(): Promise<SessionUser> {
    return api.get<SessionUser>('/auth/me');
  },

  async logout(): Promise<void> {
    const refreshToken = session.refreshToken;
    if (refreshToken) {
      // Best effort — a failed revoke must not trap the user in a session.
      await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
    }
    session.clear();
  },
};
