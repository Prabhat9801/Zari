import { ArrowRight, ScrollText, Send, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { Button, DemoNote, DesignerShell, Toast, type ToastState } from './_shared';
import { useDesignerBids, useDesignerOpportunities, useSubmitBid, useWithdrawBid } from '@/hooks/useDesigner';
import { ApiError } from '@/lib/apiClient';
import { isApiConfigured } from '@/lib/config';
import type { OpportunityView } from '@/services/designer';

/**
 * Quotes — both halves of a designer's marketplace day.
 *
 * Top: requests Zari matched to this studio, each with the itemised estimate as
 * a RANGE and the customer's budget. Bottom: the quotes already sent, each a
 * point value. The product never blurs the two, so neither does this screen.
 *
 * The form takes rupees because that is what a designer thinks in; it is
 * multiplied into paise on the way out, because that is what the API stores.
 */

interface Draft {
  price: string;
  leadTimeDays: string;
  message: string;
}

const EMPTY_DRAFT: Draft = { price: '', leadTimeDays: '', message: '' };

const digitsOnly = (value: string): string => value.replace(/\D/g, '');

function BidForm({
  opportunity,
  draft,
  setDraft,
  onCancel,
  onSubmit,
  pending,
}: {
  opportunity: OpportunityView;
  draft: Draft;
  setDraft: (draft: Draft) => void;
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <div style={{ borderTop: '1px solid hsl(var(--border))', marginTop: 16, paddingTop: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>
        Your quote for {opportunity.requestCode}
      </div>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor={`bid-price-${opportunity.id}`}>
            Your quote <span>In rupees, a single figure</span>
          </label>
          <input
            id={`bid-price-${opportunity.id}`}
            inputMode="numeric"
            value={draft.price}
            onChange={(event) => setDraft({ ...draft, price: digitsOnly(event.target.value) })}
            placeholder="6400"
            data-testid={`input-bid-price-${opportunity.requestCode}`}
          />
        </div>
        <div className="form-field">
          <label htmlFor={`bid-lead-${opportunity.id}`}>
            Lead time <span>Working days from confirmation</span>
          </label>
          <input
            id={`bid-lead-${opportunity.id}`}
            inputMode="numeric"
            value={draft.leadTimeDays}
            onChange={(event) => setDraft({ ...draft, leadTimeDays: digitsOnly(event.target.value) })}
            placeholder="14"
            data-testid={`input-bid-lead-time-${opportunity.requestCode}`}
          />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor={`bid-message-${opportunity.id}`}>
          A note to the customer <span>Optional</span>
        </label>
        <textarea
          id={`bid-message-${opportunity.id}`}
          value={draft.message}
          onChange={(event) => setDraft({ ...draft, message: event.target.value })}
          placeholder="How you would make this, and anything you would change."
          data-testid={`input-bid-message-${opportunity.requestCode}`}
        />
      </div>
      <div className="match-buttons">
        <Button variant="ghost" onClick={onCancel} testId={`button-cancel-bid-${opportunity.requestCode}`}>
          <X size={14} /> Cancel
        </Button>
        <Button
          variant="coral"
          onClick={onSubmit}
          disabled={pending}
          testId={`button-submit-bid-${opportunity.requestCode}`}
        >
          {pending ? 'Sending…' : 'Send quote'} <Send size={14} />
        </Button>
      </div>
    </div>
  );
}

export default function DesignerBids() {
  const { data: opportunities, isLive: opportunitiesLive } = useDesignerOpportunities();
  const { data: bids, isLive: bidsLive } = useDesignerBids();
  const submitBid = useSubmitBid();
  const withdrawBid = useWithdrawBid();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [toast, setToast] = useState<ToastState>(null);

  const open = (opportunity: OpportunityView) => {
    setOpenId(opportunity.id);
    setDraft(EMPTY_DRAFT);
  };

  const close = () => {
    setOpenId(null);
    setDraft(EMPTY_DRAFT);
  };

  const send = (opportunity: OpportunityView) => {
    const rupees = Number(draft.price);
    const leadTimeDays = Number(draft.leadTimeDays);
    if (!rupees) {
      setToast({ message: 'Add your quote before sending it.' });
      return;
    }
    if (!leadTimeDays || leadTimeDays > 180) {
      setToast({ message: 'Give a lead time between 1 and 180 days.' });
      return;
    }
    if (!isApiConfigured) {
      setToast({ message: `Your quote for ${opportunity.requestCode} is ready to send.` });
      close();
      return;
    }
    submitBid.mutate(
      {
        requestId: opportunity.requestId,
        // Money is paise everywhere. The designer typed rupees.
        price: rupees * 100,
        leadTimeDays,
        message: draft.message,
      },
      {
        onSuccess: () => {
          setToast({ message: `Your quote went to the customer for ${opportunity.requestCode}.` });
          close();
        },
        onError: (error) =>
          setToast({
            message:
              error instanceof ApiError
                ? error.message
                : "Zari couldn't send that quote. Nothing is lost — try again.",
          }),
      },
    );
  };

  const withdraw = (bidId: string, code: string) => {
    if (!isApiConfigured) {
      setToast({ message: `Your quote for ${code} is withdrawn.` });
      return;
    }
    withdrawBid.mutate(bidId, {
      onSuccess: () => setToast({ message: `Your quote for ${code} is withdrawn.` }),
      onError: (error) =>
        setToast({
          message:
            error instanceof ApiError
              ? error.message
              : "Zari couldn't withdraw that quote. Nothing is lost — try again.",
        }),
    });
  };

  return (
    <DesignerShell breadcrumb="Quotes">
      <div className="app-heading">
        <div>
          <div className="eyebrow">
            Designer space / quotes <DemoNote isLive={opportunitiesLive && bidsLive} />
          </div>
          <h1>Requests and quotes.</h1>
          <p>An estimate is Zari's range. Your quote is one figure you can stand behind.</p>
        </div>
      </div>

      <div className="subheading">
        <h2>
          Matched to your studio <DemoNote isLive={opportunitiesLive} />
        </h2>
        <span className="eyebrow">{opportunities.length} open</span>
      </div>

      {opportunities.length ? (
        <div className="quote-list" style={{ marginBottom: 45 }}>
          {opportunities.map((opportunity) => (
            <article
              className={`match-card ${opportunity.rank === 1 ? 'featured' : ''}`}
              key={opportunity.id}
              data-testid={`card-opportunity-${opportunity.requestCode}`}
            >
              <div className="match-top">
                <span className="avatar">{String(opportunity.rank).padStart(2, '0')}</span>
                <div>
                  <strong>{opportunity.title}</strong>
                  <span>
                    {[opportunity.category, opportunity.city, opportunity.requestCode]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <span className="score" style={{ marginLeft: 'auto' }}>
                  {opportunity.matchScore}% MATCH
                </span>
              </div>

              <div className="match-stats">
                <div>
                  <strong>{opportunity.estimateLabel ?? '—'}</strong>
                  <span>Zari estimate</span>
                </div>
                <div>
                  <strong>{opportunity.budgetLabel ?? 'Open'}</strong>
                  <span>Customer budget</span>
                </div>
                <div>
                  <strong>{opportunity.neededByLabel?.replace('Needed by ', '') ?? 'Flexible'}</strong>
                  <span>Needed by</span>
                </div>
              </div>

              {opportunity.brief && <p>{opportunity.brief}</p>}

              {opportunity.existingBid && (
                <div className="verified" data-testid={`status-existing-bid-${opportunity.requestCode}`}>
                  You quoted {opportunity.existingBid.priceLabel} — sending again replaces it.
                </div>
              )}

              {openId === opportunity.id ? (
                <BidForm
                  opportunity={opportunity}
                  draft={draft}
                  setDraft={setDraft}
                  onCancel={close}
                  onSubmit={() => send(opportunity)}
                  pending={submitBid.isPending}
                />
              ) : (
                <div className="match-buttons">
                  <Button
                    variant={opportunity.rank === 1 ? 'coral' : 'primary'}
                    onClick={() => open(opportunity)}
                    testId={`button-quote-${opportunity.requestCode}`}
                  >
                    {opportunity.existingBid ? 'Revise your quote' : 'Send a quote'}{' '}
                    <ArrowRight size={14} />
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state" style={{ marginBottom: 45 }}>
          <Sparkles size={23} />
          <h3>No requests are matched to you yet.</h3>
          <p>Adding work to your portfolio is what tells Zari which designs to send you.</p>
          <Link href="/designer/profile" className="button button-primary" data-testid="link-empty-add-work">
            Add work to your studio
          </Link>
        </div>
      )}

      <div className="subheading">
        <h2>
          Your quotes <DemoNote isLive={bidsLive} />
        </h2>
        <span className="eyebrow">{bids.length} sent</span>
      </div>

      {bids.length ? (
        <div className="quote-list">
          {bids.map((bid) => (
            <div className="quote-row" key={bid.id} data-testid={`card-bid-${bid.requestCode}`}>
              <div>
                <strong>{bid.title}</strong>
                <small>
                  {[
                    bid.requestCode,
                    `${bid.leadTimeDays} day lead time`,
                    bid.budgetLabel ? `Budget ${bid.budgetLabel}` : null,
                    bid.neededByLabel,
                    bid.submittedLabel,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </div>
              <span className="quote-price">{bid.priceLabel}</span>
              <div style={{ display: 'grid', justifyItems: 'end', gap: 8 }}>
                <span className="status-pill">{bid.statusLabel}</span>
                {bid.canWithdraw && (
                  <button
                    className="text-link"
                    onClick={() => withdraw(bid.id, bid.requestCode)}
                    data-testid={`button-withdraw-bid-${bid.requestCode}`}
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ScrollText size={23} />
          <h3>You have not quoted yet.</h3>
          <p>Every quote is a price and a promised date you choose. Start with your best match.</p>
          <Button
            onClick={() => {
              const first = opportunities[0];
              if (first) open(first);
              else setToast({ message: 'New requests will appear here as they are matched to you.' });
            }}
            testId="button-empty-send-quote"
          >
            Send your first quote
          </Button>
        </div>
      )}

      <Toast toast={toast} setToast={setToast} />
    </DesignerShell>
  );
}
