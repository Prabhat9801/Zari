import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiData, type ApiData } from './useApiData';
import { budgetService, type ApplyResult, type BudgetRun, type ToggleResult } from '@/services/budget';
import { mockBudgetRuns } from '@/data/mock';

/**
 * The budget optimizer's data.
 *
 * The runs list goes through `useApiData` so the panel always has something to
 * show — live runs when the API answers, the demo set when it doesn't — and
 * reports `isLive` so the screen can say which one the customer is looking at.
 *
 * The three writes are plain mutations. None of them is optimistic about the
 * design itself: applying a plan creates a new version, and that only ever
 * happens because someone pressed the button.
 */

export const budgetRunsKey = (designId: string | undefined) => ['budget-runs', designId] as const;

export function useBudgetRuns(designId: string | undefined): ApiData<BudgetRun[]> {
  return useApiData<BudgetRun[]>(
    budgetRunsKey(designId),
    () => budgetService.listRuns(designId!),
    mockBudgetRuns,
    { enabled: Boolean(designId) },
  );
}

export function useOptimizeBudget(designId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<BudgetRun, Error, { targetAmount: number; versionId?: string }>({
    mutationFn: (input) => budgetService.optimize(designId!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: budgetRunsKey(designId) });
    },
  });
}

/**
 * `substitutionIds` is the set to KEEP selected. The response carries the
 * server's own maths, which is what the customer is shown — the panel never
 * publishes a number it worked out on its own once the real one has landed.
 */
export function useToggleSubstitutions(designId: string | undefined) {
  return useMutation<ToggleResult, Error, { planId: string; substitutionIds: string[] }>({
    mutationFn: ({ planId, substitutionIds }) =>
      budgetService.setSubstitutions(designId!, planId, substitutionIds),
  });
}

export function useApplyPlan(designId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<ApplyResult, Error, string>({
    mutationFn: (planId) => budgetService.applyPlan(designId!, planId),
    onSuccess: () => {
      // A new version exists now, so the design, the list, and the runs that
      // reference it are all stale.
      void queryClient.invalidateQueries({ queryKey: ['design', designId] });
      void queryClient.invalidateQueries({ queryKey: ['designs'] });
      void queryClient.invalidateQueries({ queryKey: budgetRunsKey(designId) });
    },
  });
}
