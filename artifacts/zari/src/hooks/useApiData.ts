import { useQuery, type QueryKey } from '@tanstack/react-query';
import { DEFAULT_STALE_TIME, isApiConfigured } from '@/lib/config';

export interface ApiData<T> {
  data: T;
  /** True when `data` came from the API. False when it is the bundled demo set. */
  isLive: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch with a guaranteed answer.
 *
 * Returns API data when the backend responds, and the bundled demo set when it
 * doesn't — no spinner that never resolves, no empty screen. `isLive` says
 * which one you got, so the UI can be honest about it instead of passing demo
 * data off as real.
 *
 * An empty successful response still falls back: a designer directory with zero
 * studios is a worse first impression than the demo set, and it is almost always
 * a freshly seeded environment rather than a real state.
 */
export function useApiData<T>(
  key: QueryKey,
  fetcher: () => Promise<T>,
  fallback: T,
  options?: { enabled?: boolean; fallbackOnEmpty?: boolean },
): ApiData<T> {
  const enabled = isApiConfigured && (options?.enabled ?? true);

  const query = useQuery({
    queryKey: key,
    queryFn: fetcher,
    enabled,
    // The API being down is an expected state here, not something to hammer.
    retry: 1,
    staleTime: DEFAULT_STALE_TIME,
    refetchOnWindowFocus: false,
  });

  const fallbackOnEmpty = options?.fallbackOnEmpty ?? true;
  const isEmpty =
    fallbackOnEmpty && Array.isArray(query.data) && (query.data as unknown[]).length === 0;

  const hasLiveData = query.isSuccess && query.data !== undefined && !isEmpty;

  return {
    data: hasLiveData ? (query.data as T) : fallback,
    isLive: hasLiveData,
    isLoading: enabled && query.isLoading,
    error: (query.error as Error | null) ?? null,
    refetch: () => void query.refetch(),
  };
}
