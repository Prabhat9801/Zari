import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiData } from './useApiData';
import {
  opsService,
  type CostRuleInput,
  type DisputeResolutionInput,
  type QcDecisionInput,
  type QcPhotoInput,
  type VerificationDecision,
} from '@/services/ops';
import {
  mockCostRules,
  mockOpsDisputes,
  mockOpsOverview,
  mockPendingVerifications,
  mockQcQueue,
} from '@/data/mock';

/**
 * The ops console's data layer.
 *
 * Reads go through `useApiData`, so an ops screen always renders something and
 * always says which it is. Writes are plain mutations — they are consequential
 * and must never be faked, so every screen checks `isLive` before offering one.
 */

const OPS_KEY = ['ops'] as const;

export const useOpsOverview = () =>
  useApiData(['ops', 'overview'], opsService.overview, mockOpsOverview, {
    fallbackOnEmpty: false,
  });

export const useQcQueue = () => useApiData(['ops', 'qc-queue'], opsService.qcQueue, mockQcQueue);

export const usePendingVerifications = () =>
  useApiData(['ops', 'designers'], opsService.pendingVerifications, mockPendingVerifications);

export const useOpsDisputes = () =>
  useApiData(['ops', 'disputes'], opsService.disputes, mockOpsDisputes);

/** Includes retired rules, so the table can show what was withdrawn and when. */
export const useCostRules = () =>
  useApiData(['ops', 'cost-rules'], opsService.costRules, mockCostRules);

/** Everything ops writes changes a counter on the overview, so refresh it too. */
function useOpsInvalidation() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: OPS_KEY });
}

export function useStartQcRound() {
  const invalidate = useOpsInvalidation();
  return useMutation({
    mutationFn: (orderId: string) => opsService.startQcRound(orderId),
    onSuccess: invalidate,
  });
}

export function useAddQcPhotos() {
  const invalidate = useOpsInvalidation();
  return useMutation({
    mutationFn: (input: { checkId: string; photos: QcPhotoInput[] }) =>
      opsService.addQcPhotos(input.checkId, input.photos),
    onSuccess: invalidate,
  });
}

/**
 * The single most consequential call in the product: a pass here is the only
 * thing that releases the escrow balance to the designer.
 */
export function useDecideQc() {
  const invalidate = useOpsInvalidation();
  return useMutation({
    mutationFn: (input: { checkId: string; decision: QcDecisionInput }) =>
      opsService.decideQc(input.checkId, input.decision),
    onSuccess: invalidate,
  });
}

export function useVerifyDesigner() {
  const invalidate = useOpsInvalidation();
  return useMutation({
    mutationFn: (input: {
      designerId: string;
      status: VerificationDecision;
      reviewNotes?: string | null;
    }) =>
      opsService.verifyDesigner(input.designerId, {
        status: input.status,
        reviewNotes: input.reviewNotes ?? null,
      }),
    onSuccess: invalidate,
  });
}

export function useResolveDispute() {
  const invalidate = useOpsInvalidation();
  return useMutation({
    mutationFn: (input: { disputeId: string; resolution: DisputeResolutionInput }) =>
      opsService.resolveDispute(input.disputeId, input.resolution),
    onSuccess: invalidate,
  });
}

export function useSaveCostRule() {
  const invalidate = useOpsInvalidation();
  return useMutation({
    mutationFn: (input: CostRuleInput) => opsService.saveCostRule(input),
    onSuccess: invalidate,
  });
}

export function useRetireCostRule() {
  const invalidate = useOpsInvalidation();
  return useMutation({
    mutationFn: (id: string) => opsService.retireCostRule(id),
    onSuccess: invalidate,
  });
}
