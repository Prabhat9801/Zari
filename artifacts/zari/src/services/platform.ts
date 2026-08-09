import { api } from '@/lib/apiClient';

/**
 * Public, unauthenticated facts about how Zari operates.
 *
 * The landing page states numbers about money — how much is held in escrow,
 * when the balance moves, how long the fit window is. Those are set by server
 * configuration, so hardcoding them into marketing copy means the page starts
 * lying the moment ops changes one. It reads them from the API instead.
 */

export interface PlatformConfig {
  advancePercent: number;
  balancePercent: number;
  fitWindowDays: number;
  guestFreeGenerations: number;
  currency: string;
}

export interface ScoringComponent {
  key: string;
  label: string;
  source: string;
}

export interface ScoringPolicy {
  components: ScoringComponent[];
  weights: Record<string, number>;
  note: string;
  matchingNote: string;
}

/** Used when the API is unreachable. Mirrors the server defaults. */
export const FALLBACK_CONFIG: PlatformConfig = {
  advancePercent: 40,
  balancePercent: 60,
  fitWindowDays: 7,
  guestFreeGenerations: 1,
  currency: 'INR',
};

export const FALLBACK_SCORING: ScoringPolicy = {
  components: [
    { key: 'craftSkill', label: 'Craft skill', source: 'Customer reviews of finished work' },
    { key: 'pastSuccess', label: 'Past success', source: 'Orders that passed QC first time' },
    { key: 'onTimeDelivery', label: 'On-time delivery', source: 'Delivered by the promised date' },
    { key: 'communication', label: 'Communication', source: 'Customer ratings for responsiveness' },
    { key: 'customerRating', label: 'Customer rating', source: 'Overall review score' },
  ],
  weights: { craftSkill: 0.25, pastSuccess: 0.2, onTimeDelivery: 0.25, communication: 0.15, customerRating: 0.15 },
  note: 'Placement is never paid for. Price is not part of the Quality Score.',
  matchingNote: 'Designers are ranked on fit and quality, not on the lowest price.',
};

export const platformService = {
  async config(): Promise<PlatformConfig> {
    const data = await api.get<Omit<PlatformConfig, 'balancePercent'>>('/config');
    return { ...data, balancePercent: 100 - data.advancePercent };
  },

  async scoring(): Promise<ScoringPolicy> {
    const data = await api.get<{
      qualityScore: { weights: Record<string, number>; components: ScoringComponent[]; note: string };
      matching: { weights: Record<string, number>; note: string };
    }>('/marketplace/scoring');

    return {
      components: data.qualityScore.components,
      weights: data.qualityScore.weights,
      note: data.qualityScore.note,
      matchingNote: data.matching.note,
    };
  },
};
