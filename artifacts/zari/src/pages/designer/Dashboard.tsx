import { AlertTriangle, ArrowRight, Check, MessageCircle } from 'lucide-react';
import { Link } from 'wouter';
import { DemoNote, DesignerShell } from './_shared';
import { useDesignerDashboard } from '@/hooks/useDesigner';
import { formatINR } from '@/types';
import type { DesignerOrderCard } from '@/services/designer';

/**
 * The designer dashboard.
 *
 * A boutique business operating system, not a chart wall: what came in, what is
 * owed, what is late, and what to do next. Every figure the API sends is paise;
 * formatINR is the only thing that turns it into rupees.
 */

/** "in 2 days" reads better than a raw number, and "1 day late" is unmissable. */
const dueLabel = (daysLeft: number | null): string => {
  if (daysLeft === null) return 'No date set';
  if (daysLeft < 0) return `${Math.abs(daysLeft)} day${daysLeft === -1 ? '' : 's'} late`;
  if (daysLeft === 0) return 'Due today';
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
};

function OrderRow({ order }: { order: DesignerOrderCard }) {
  return (
    <div className="surface order-row" data-testid={`card-designer-order-${order.code}`}>
      <div style={{ textAlign: 'center' }}>
        <strong style={{ display: 'block', font: '400 26px var(--app-font-serif)' }}>
          {order.daysLeft === null ? '—' : Math.abs(order.daysLeft)}
        </strong>
        <span className="eyebrow">{dueLabel(order.daysLeft)}</span>
      </div>
      <div>
        <strong>{order.title}</strong>
        <p>
          {[order.code, order.promisedLabel, order.nextMilestone ? `Next: ${order.nextMilestone}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div>
        <span className="status-pill">{order.statusLabel}</span>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Final price {order.priceLabel}
        </div>
      </div>
    </div>
  );
}

export default function DesignerDashboard() {
  const { data, isLive } = useDesignerDashboard();
  const { metrics } = data;

  return (
    <DesignerShell studioName={data.studioName} breadcrumb="Dashboard">
      <div className="app-heading">
        <div>
          <div className="eyebrow">
            Designer space / dashboard <DemoNote isLive={isLive} />
          </div>
          <h1>{data.studioName}</h1>
          <p>
            {metrics.activeOrders === 0
              ? 'No garments in production right now.'
              : `${metrics.activeOrders} garment${metrics.activeOrders === 1 ? '' : 's'} in production · studio ${metrics.capacityPercent}% full.`}
          </p>
        </div>
        <Link href="/designer/copilot" className="button button-coral" data-testid="link-open-copilot">
          Today with Copilot <ArrowRight size={15} />
        </Link>
      </div>

      {data.atRisk.length > 0 && (
        <div className="guest-banner" data-testid="card-at-risk">
          <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {data.atRisk.length === 1
            ? `${data.atRisk[0]!.code} is close to its promised date. `
            : `${data.atRisk.length} orders are close to their promised date. `}
          Moving the next milestone today keeps the promise you made:{' '}
          {data.atRisk.map((order) => `${order.code} (${dueLabel(order.daysLeft)})`).join(', ')}.
        </div>
      )}

      <div className="profile-metrics">
        <div>
          <span>Revenue this month</span>
          <strong>{formatINR(metrics.revenueThisMonth)}</strong>
        </div>
        <div>
          <span>Revenue lifetime</span>
          <strong>{formatINR(metrics.revenueLifetime)}</strong>
        </div>
        <div>
          <span>Active orders</span>
          <strong>{metrics.activeOrders}</strong>
        </div>
        <div>
          <span>Quotes awaiting a decision</span>
          <strong>{metrics.pendingBids}</strong>
        </div>
      </div>

      <div className="profile-metrics">
        <div>
          <span>On-time delivery</span>
          <strong>{metrics.onTimePercent}%</strong>
        </div>
        <div>
          <span>Zari Quality Score</span>
          <strong>{metrics.qualityScore}</strong>
        </div>
        <div>
          <span>Studio capacity</span>
          <strong>{metrics.capacityPercent}% full</strong>
        </div>
        <div>
          <span>Customer rating</span>
          <strong>
            {metrics.rating.toFixed(1)} / 5{' '}
            <small className="muted" style={{ fontSize: 11 }}>
              ({metrics.reviewsCount})
            </small>
          </strong>
        </div>
      </div>

      <div className="subheading">
        <h2>Orders requiring attention</h2>
        <Link href="/designer/quality" data-testid="link-dashboard-quality">
          How your score is built <ArrowRight size={13} />
        </Link>
      </div>

      {data.needsAttention.length ? (
        <div className="orders-list">
          {data.needsAttention.map((order) => (
            <OrderRow order={order} key={order.id} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Check size={23} />
          <h3>Nothing is waiting on you.</h3>
          <p>Every order is on track. New requests matched to your studio arrive under quotes.</p>
          <Link href="/designer/bids" className="button button-primary" data-testid="link-empty-view-opportunities">
            See new requests
          </Link>
        </div>
      )}

      <div className="surface studio-card" style={{ marginTop: 22, maxWidth: 820 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <MessageCircle size={16} className="text-accent" />
          <div style={{ flex: 1, minWidth: 180 }}>
            <strong style={{ fontSize: 13 }}>
              {data.unreadMessages === 0
                ? 'No messages waiting'
                : `${data.unreadMessages} message${data.unreadMessages === 1 ? '' : 's'} waiting for a reply`}
            </strong>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Customers who hear back the same day are far more likely to place the order.
            </div>
          </div>
          <Link href="/designer/copilot" className="text-link" data-testid="link-dashboard-messages">
            Open Copilot <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </DesignerShell>
  );
}
