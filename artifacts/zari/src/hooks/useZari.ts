import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiData } from './useApiData';
import { authService } from '@/services/auth';
import { designsService } from '@/services/designs';
import { marketplaceService } from '@/services/marketplace';
import { ordersService } from '@/services/orders';
import { isApiConfigured } from '@/lib/config';
import { session, type SessionUser } from '@/lib/session';
import {
  mockDesignDetail,
  mockDesignerProfiles,
  mockDesigners,
  mockDesigns,
  mockOrders,
  mockProfileAliases,
} from '@/data/mock';
import type { DesignerProfileView } from '@/types';

/**
 * Issues a guest token on first load so the Design Studio works before signup.
 * Fails silently — a visitor should never see an error for something they did
 * not ask for.
 */
export function useGuestBootstrap(): void {
  useEffect(() => {
    if (!isApiConfigured) return;
    void authService.ensureGuest().catch(() => undefined);
  }, []);
}

export function useCurrentUser(): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(() => session.user);

  useEffect(() => {
    // Another tab signing in or out should update this one.
    const onStorage = () => setUser(session.user);
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return user;
}

export const useDesigns = () => useApiData(['designs'], designsService.list, mockDesigns);

export const useDesign = (designId: string | undefined) =>
  useApiData(
    ['design', designId],
    () => designsService.get(designId!),
    { ...mockDesignDetail, id: designId ?? mockDesignDetail.id },
    { enabled: Boolean(designId), fallbackOnEmpty: false },
  );

export const useDesigners = () =>
  useApiData(['designers'], marketplaceService.listDesigners, mockDesigners);

export function useDesignerProfile(slugOrId: string | undefined) {
  // Older links use short ids (/designers/aanya); the API uses slugs.
  const slug = slugOrId ? (mockProfileAliases[slugOrId] ?? slugOrId) : undefined;
  const fallback: DesignerProfileView =
    (slug ? mockDesignerProfiles[slug] : undefined) ?? mockDesignerProfiles['aanya-studio']!;

  return useApiData(
    ['designer', slug],
    () => marketplaceService.getDesigner(slug!),
    fallback,
    { enabled: Boolean(slug), fallbackOnEmpty: false },
  );
}

export const useOrders = () => useApiData(['orders'], ordersService.list, mockOrders);

/**
 * One order in full — the real amounts, milestones, escrow state and fit window.
 *
 * The order page used to render a hardcoded ₹6,400 and a fixed timeline on top
 * of a live order's title and designer, so a real order showed someone else's
 * price. This endpoint was written and had no caller.
 */
export const useOrder = (orderId: string | undefined) =>
  useApiData(
    ['order', orderId],
    () => ordersService.get(orderId!),
    null as Awaited<ReturnType<typeof ordersService.get>> | null,
    { enabled: Boolean(orderId), fallbackOnEmpty: false },
  );

/** Brief -> concepts. Returns the created design ids so the caller can navigate. */
export function useGenerateDesign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (brief: string) => designsService.generate({ brief }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['designs'] });
    },
  });
}

export function useEditDesign(designId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instruction: string) => designsService.edit(designId!, instruction),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design', designId] });
    },
  });
}

export function useAuthActions() {
  const queryClient = useQueryClient();

  const signup = useMutation({
    mutationFn: authService.signup,
    onSuccess: () => void queryClient.invalidateQueries(),
  });

  const login = useMutation({
    mutationFn: authService.login,
    onSuccess: () => void queryClient.invalidateQueries(),
  });

  return { signup, login };
}
