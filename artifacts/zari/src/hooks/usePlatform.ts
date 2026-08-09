import { useApiData } from './useApiData';
import {
  FALLBACK_CONFIG,
  FALLBACK_SCORING,
  platformService,
} from '@/services/platform';

/**
 * The escrow split, fit window and guest quota, read from the server.
 *
 * Cached hard: these change roughly never, and the landing page should not make
 * a request per visit for them. The fallback mirrors the server defaults, so a
 * visitor with an unreachable API still sees the right numbers rather than
 * blanks where the money terms should be.
 */
export const usePlatformConfig = () =>
  useApiData(['platform-config'], platformService.config, FALLBACK_CONFIG, {
    fallbackOnEmpty: false,
  });

/** The published Quality Score weights — exposing them is the point. */
export const useScoringPolicy = () =>
  useApiData(['scoring-policy'], platformService.scoring, FALLBACK_SCORING, {
    fallbackOnEmpty: false,
  });
