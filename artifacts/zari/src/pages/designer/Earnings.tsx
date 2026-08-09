import { ArrowRight, ShieldCheck, WalletCards } from 'lucide-react';
import { Link } from 'wouter';
import { DemoNote, DesignerShell } from './_shared';
import { useDesignerEarnings } from '@/hooks/useDesigner';
import { formatINR } from '@/types';

/**
 * Earnings.
 *
 * Three numbers a designer actually needs: what has landed, what is on its way,
 * and what Zari is still holding. The escrow figure is money that exists but is
 * not theirs yet — it is labelled that way rather than folded into a total.
 */
export default function DesignerEarnings() {
  const { data, isLive } = useDesignerEarnings();

  return (
    <DesignerShell breadcrumb="Earnings">
      <div className="app-heading">
        <div>
          <div className="eyebrow">
            Designer space / earnings <DemoNote isLive={isLive} />
          </div>
          <h1>What you have earned.</h1>
          <p>Every figure below is tied to a specific order. Nothing is estimated here.</p>
        </div>
        <Link href="/designer/profile" className="button button-ghost" data-testid="link-payout-account">
          Payout account <ArrowRight size={14} />
        </Link>
      </div>

      <div className="profile-metrics">
        <div>
          <span>Paid to you</span>
          <strong>{formatINR(data.paid)}</strong>
        </div>
        <div>
          <span>On its way</span>
          <strong>{formatINR(data.pending)}</strong>
        </div>
        <div>
          <span>Held in escrow</span>
          <strong>{formatINR(data.inEscrow)}</strong>
        </div>
        <div>
          <span>Payouts recorded</span>
          <strong>{data.payouts.length}</strong>
        </div>
      </div>

      <div className="order-detail">
        <section>
          <div className="subheading">
            <h2>Payouts</h2>
            <span className="eyebrow">Newest first</span>
          </div>

          {data.payouts.length ? (
            <div className="quote-list">
              {data.payouts.map((payout) => (
                <div className="quote-row" key={payout.id} data-testid={`card-payout-${payout.id}`}>
                  <div>
                    <strong>Order {payout.orderCode}</strong>
                    <small>
                      {payout.dateLabel}
                      {payout.failureReason ? ` · ${payout.failureReason}` : ''}
                    </small>
                  </div>
                  <span className="quote-price">{payout.amountLabel}</span>
                  <span className="status-pill">{payout.statusLabel}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <WalletCards size={23} />
              <h3>No payouts yet.</h3>
              <p>Your first payout appears here once an order passes Zari quality control.</p>
              <Link href="/designer/bids" className="button button-primary" data-testid="link-empty-earnings-quotes">
                See open requests
              </Link>
            </div>
          )}
        </section>

        <aside style={{ display: 'grid', alignContent: 'start', gap: 15 }}>
          <div className="escrow surface">
            <div className="eyebrow" style={{ color: 'hsl(39 42% 86%)' }}>
              When the money moves
            </div>
            <h3>Escrow, in your favour too.</h3>
            <p>{data.note}</p>
            <div className="escrow-row">
              <span>At acceptance</span>
              <strong>40% held</strong>
            </div>
            <div className="escrow-row">
              <span>After Zari QC</span>
              <strong>Balance released</strong>
            </div>
          </div>

          <div className="surface studio-card">
            <div className="eyebrow">No shortcuts, in either direction</div>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, margin: '12px 0 0' }}>
              Release happens on the quality-control pass and nowhere else. There is deliberately no
              admin button that pays early, which is the same reason a customer cannot pull funds
              back once the work has passed.
            </p>
          </div>

          <div className="profile-trust">
            <ShieldCheck size={16} />
            <span>A customer's payment is captured to Zari, never held by you or by them.</span>
          </div>
        </aside>
      </div>
    </DesignerShell>
  );
}
