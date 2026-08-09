import { Link } from 'wouter';
import { ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { formatINR } from '@/types';
import { useOpsOverview } from '@/hooks/useOps';
import { DemoNote, OpsButton, OpsShell } from './OpsShell';

/**
 * The ops front door.
 *
 * Five counters, each one a queue that is waiting on a human. Ranked by how
 * much a delay costs someone: money held in escrow first, then a studio waiting
 * to be let in, then a customer waiting to be heard.
 */
export default function OpsOverviewPage() {
  const { data: overview, isLive, isLoading, refetch } = useOpsOverview();

  const tiles: { label: string; value: string; note: string; href: string; testId: string }[] = [
    {
      label: 'Quality checks waiting',
      value: String(overview.qcQueue),
      note: 'Escrow stays held until each one passes',
      href: '/ops/qc',
      testId: 'card-metric-qc-queue',
    },
    {
      label: 'Studios awaiting review',
      value: String(overview.pendingVerifications),
      note: 'Unverified studios cannot be matched',
      href: '/ops/designers',
      testId: 'card-metric-verifications',
    },
    {
      label: 'Open disputes',
      value: String(overview.openDisputes),
      note: 'A customer and a designer both waiting',
      href: '/ops/disputes',
      testId: 'card-metric-disputes',
    },
    {
      label: 'Orders in production',
      value: String(overview.activeOrders),
      note: 'Confirmed, being made, or in quality check',
      href: '/ops/qc',
      testId: 'card-metric-active-orders',
    },
    {
      label: 'Payouts pending',
      value: formatINR(overview.pendingPayouts.amount),
      note: `${overview.pendingPayouts.count} payout${overview.pendingPayouts.count === 1 ? '' : 's'} released and waiting to send`,
      href: '/ops/qc',
      testId: 'card-metric-payouts',
    },
  ];

  return (
    <OpsShell section="OVERVIEW">
      <div className="app-heading">
        <div>
          <div className="eyebrow">
            Zari operations {isLoading ? '· loading' : ''} <DemoNote isLive={isLive} />
          </div>
          <h1>The queues that need a person.</h1>
          <p>Nothing on this page moves on its own. Each number is someone waiting on a decision.</p>
        </div>
        <OpsButton variant="ghost" onClick={refetch} testId="button-refresh-overview">
          <RefreshCw size={14} /> Refresh
        </OpsButton>
      </div>

      <div
        className="profile-metrics"
        style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
        data-testid="card-ops-metrics"
      >
        {tiles.map((tile) => (
          <div key={tile.label} data-testid={tile.testId}>
            <span>{tile.label}</span>
            <strong>{tile.value}</strong>
            <p className="muted" style={{ fontSize: 11, lineHeight: 1.45, margin: '8px 0 0' }}>
              {tile.note}
            </p>
          </div>
        ))}
      </div>

      <div className="designers-row" style={{ marginTop: 0, alignItems: 'start' }}>
        <div className="surface studio-card">
          <h3>Quality control</h3>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 0 }}>
            Review the garment against the approved version on five criteria. A pass is the only
            thing in Zari that releases the escrow balance to a designer.
          </p>
          <Link href="/ops/qc" className="text-link" data-testid="link-ops-open-qc">
            Open the queue <ArrowRight size={13} />
          </Link>
        </div>

        <div className="surface studio-card">
          <h3>Studio verification</h3>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 0 }}>
            Identity, studio location, and work samples. A studio stays out of designer matches
            until someone here has read it.
          </p>
          <Link href="/ops/designers" className="text-link" data-testid="link-ops-open-designers">
            Review studios <ArrowRight size={13} />
          </Link>
        </div>

        <div className="surface studio-card">
          <h3>Disputes</h3>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 0 }}>
            Read both accounts, then resolve for the customer, for the designer, or as a split — with
            a refund when one is owed.
          </p>
          <Link href="/ops/disputes" className="text-link" data-testid="link-ops-open-disputes">
            Open disputes <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      <div className="marketplace-grid" style={{ marginTop: 24 }}>
        <div className="escrow surface">
          <div className="eyebrow" style={{ color: 'hsl(39 42% 86%)' }}>
            Where the money sits
          </div>
          <h3>Only a quality pass moves it.</h3>
          <p>
            Every advance is held against the order, not paid to the studio. There is deliberately
            no shortcut in this console to pay a designer early — the balance is released on the
            quality control screen, by passing all five criteria, and nowhere else.
          </p>
          <div className="escrow-row">
            <span>Held across active orders</span>
            <strong>{overview.activeOrders} orders</strong>
          </div>
          <div className="escrow-row">
            <span>Released, waiting to send</span>
            <strong>{formatINR(overview.pendingPayouts.amount)}</strong>
          </div>
        </div>

        <div className="surface studio-card">
          <h3>
            <ShieldCheck size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            What this console can change
          </h3>
          <div className="score-breakdown">
            <span>Quality control decisions</span>
            <strong style={{ font: '11px var(--app-font-mono)' }}>RELEASES ESCROW</strong>
          </div>
          <div className="score-breakdown">
            <span>Studio verification</span>
            <strong style={{ font: '11px var(--app-font-mono)' }}>CHANGES MATCHING</strong>
          </div>
          <div className="score-breakdown">
            <span>Dispute resolution</span>
            <strong style={{ font: '11px var(--app-font-mono)' }}>CAN REFUND</strong>
          </div>
          <div className="score-breakdown">
            <span>Cost rules</span>
            <strong style={{ font: '11px var(--app-font-mono)' }}>REPRICES ESTIMATES</strong>
          </div>
          <p className="muted" style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 0 }}>
            Every action here is written to the audit log with the account that took it.
          </p>
        </div>
      </div>
    </OpsShell>
  );
}
