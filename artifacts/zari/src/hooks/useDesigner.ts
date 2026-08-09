import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiData } from './useApiData';
import { designerService } from '@/services/designer';
import {
  mockDesignerBids,
  mockDesignerCopilot,
  mockDesignerDashboard,
  mockDesignerEarnings,
  mockDesignerOpportunities,
  mockDesignerQuality,
} from '@/data/mock';

/**
 * Designer-space data.
 *
 * Every read goes through useApiData, so a designer screen shows real numbers
 * when the API answers and the bundled demo studio when it does not — with the
 * "Sample data" chip saying which. A designer should never be shown an empty
 * dashboard because a request timed out.
 */

export const useDesignerDashboard = () =>
  useApiData(['designer', 'dashboard'], designerService.dashboard, mockDesignerDashboard, {
    fallbackOnEmpty: false,
  });

export const useDesignerBids = () =>
  useApiData(['designer', 'bids'], designerService.listBids, mockDesignerBids);

export const useDesignerOpportunities = () =>
  useApiData(
    ['designer', 'opportunities'],
    designerService.listOpportunities,
    mockDesignerOpportunities,
  );

export const useDesignerCopilot = () =>
  useApiData(['designer', 'copilot'], designerService.copilot, mockDesignerCopilot, {
    fallbackOnEmpty: false,
  });

export const useDesignerEarnings = () =>
  useApiData(['designer', 'earnings'], designerService.earnings, mockDesignerEarnings, {
    fallbackOnEmpty: false,
  });

export const useDesignerQuality = () =>
  useApiData(['designer', 'quality'], designerService.quality, mockDesignerQuality, {
    fallbackOnEmpty: false,
  });

/** Send or revise a quote. One bid per request — sending again replaces it. */
export function useSubmitBid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      requestId: string;
      price: number;
      leadTimeDays: number;
      message?: string | null;
    }) =>
      designerService.submitBid(input.requestId, {
        price: input.price,
        leadTimeDays: input.leadTimeDays,
        message: input.message ?? null,
      }),
    onSuccess: () => {
      // A new quote changes the bid list, the opportunity card, and the
      // dashboard's pending count — refresh all three rather than one.
      void queryClient.invalidateQueries({ queryKey: ['designer'] });
    },
  });
}

export function useWithdrawBid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bidId: string) => designerService.withdrawBid(bidId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['designer'] });
    },
  });
}
