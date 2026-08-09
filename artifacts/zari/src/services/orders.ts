import { api } from '@/lib/apiClient';
import { toneFor, type OrderSummary } from '@/types';

interface ApiOrder {
  id: string;
  code: string;
  status: string;
  finalPrice: number;
  promisedDate?: string | null;
  deliveredAt?: string | null;
  designer?: { studioName: string; city?: string } | null;
  version?: { design?: { title: string } | null } | null;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'AWAITING PAYMENT',
  CONFIRMED: 'CONFIRMED',
  IN_PRODUCTION: 'IN PRODUCTION',
  QC_PENDING: 'IN QUALITY CHECK',
  QC_FAILED: 'CORRECTION NEEDED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  FIT_WINDOW: 'FIT WINDOW OPEN',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  DISPUTED: 'IN DISPUTE',
};

const dateLabel = (iso?: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    : '';

const toSummary = (o: ApiOrder): OrderSummary => {
  const studio = o.designer?.studioName ?? 'your designer';
  const when = o.deliveredAt
    ? `Delivered ${dateLabel(o.deliveredAt)}`
    : o.promisedDate
      ? `Est. delivery ${dateLabel(o.promisedDate)}`
      : '';

  return {
    id: o.id,
    code: o.code,
    title: o.version?.design?.title ?? 'Your design',
    designerName: studio,
    status: o.status,
    statusLabel: STATUS_LABELS[o.status] ?? o.status.replace(/_/g, ' '),
    meta: [`With ${studio}`, `Order ${o.code}`, when].filter(Boolean).join(' · '),
    tone: toneFor(o.id),
  };
};

export const ordersService = {
  async list(): Promise<OrderSummary[]> {
    const page = await api.get<{ items: ApiOrder[] }>('/orders?limit=24');
    return page.items.map(toSummary);
  },

  async get(orderId: string) {
    return api.get<
      ApiOrder & {
        advanceAmount: number;
        balanceAmount: number;
        advancePercent: number;
        milestones: { id: string; type: string; title: string; status: string; note?: string | null; occurredAt?: string | null }[];
        escrow: { advancePaid: boolean; balanceReleased: boolean; explanation: string };
        fitGuarantee: { windowDays: number; endsAt?: string | null; explanation: string };
      }
    >(`/orders/${orderId}`);
  },
};
