import { useState } from 'react';
import { ArrowRight, Loader2, MessageCircle, ShieldCheck } from 'lucide-react';
import { formatINR } from '@/types';
import { useOpsDisputes, useResolveDispute } from '@/hooks/useOps';
import {
  DISPUTE_RESOLUTIONS,
  DISPUTE_RESOLUTION_COPY,
  rupeesToPaise,
  type DisputeResolution,
  type DisputeView,
} from '@/services/ops';
import {
  DemoNote,
  OpsButton,
  OpsShell,
  OpsToast,
  Pill,
  liveOnlyMessage,
  messageFor,
  type ToastState,
} from './OpsShell';

/**
 * Disputes.
 *
 * Two people who both believe they are right, and a decision that closes the
 * order either way. The outcome names are not self-explanatory — resolving for
 * the customer cancels the order, the other two complete it — so each option
 * says what it actually does before it is chosen.
 */

function DisputeCard({
  dispute,
  isLive,
  onToast,
}: {
  dispute: DisputeView;
  isLive: boolean;
  onToast: (toast: ToastState) => void;
}) {
  const resolve = useResolveDispute();
  const [outcome, setOutcome] = useState<DisputeResolution>('RESOLVED_SPLIT');
  const [note, setNote] = useState('');
  const [refund, setRefund] = useState('');
  const [confirming, setConfirming] = useState(false);

  const refundPaise = refund.trim() ? rupeesToPaise(refund) : 0;
  const refundInvalid = refund.trim().length > 0 && refundPaise === null;
  const refundOverPrice = refundPaise !== null && refundPaise > dispute.finalPrice;

  const submit = () => {
    if (!isLive) {
      onToast({ message: liveOnlyMessage });
      return;
    }
    if (note.trim().length < 4) {
      onToast({ message: 'Write the reasoning first. Both sides are sent this note.' });
      return;
    }
    if (refundInvalid) {
      onToast({ message: 'A refund is an amount in rupees, like 1250.' });
      return;
    }
    if (refundOverPrice) {
      onToast({ message: 'A refund cannot be more than the order was worth.' });
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    resolve.mutate(
      {
        disputeId: dispute.id,
        resolution: {
          status: outcome,
          resolutionNote: note.trim(),
          ...(refundPaise ? { refundAmount: refundPaise } : {}),
        },
      },
      {
        onSuccess: () => {
          setConfirming(false);
          onToast({
            message: refundPaise
              ? `${dispute.orderCode} resolved. ${formatINR(refundPaise)} is on its way back to ${dispute.customerName}.`
              : `${dispute.orderCode} resolved. Both sides have been told.`,
          });
        },
        onError: (error) => {
          setConfirming(false);
          onToast({
            message: messageFor(error, "Zari couldn't record that resolution. Nothing is lost — try again."),
          });
        },
      },
    );
  };

  return (
    <article
      className="match-card"
      style={{
        borderLeft:
          dispute.severity === 'urgent'
            ? '3px solid hsl(var(--destructive))'
            : '3px solid hsl(var(--accent))',
      }}
      data-testid={`card-dispute-${dispute.id}`}
    >
      <div className="match-top">
        <span className="avatar">{dispute.ageDays}d</span>
        <div>
          <strong>{dispute.orderCode || 'Order'}</strong>
          <span>
            {dispute.customerName} and {dispute.studioName}
          </span>
        </div>
        <span style={{ marginLeft: 'auto' }}>
          <Pill tone={dispute.severity === 'urgent' ? 'critical' : 'warning'}>
            {dispute.statusLabel}
          </Pill>
        </span>
      </div>

      <div className="match-stats">
        <div>
          <strong>{formatINR(dispute.finalPrice)}</strong>
          <span>Order value</span>
        </div>
        <div>
          <strong>{dispute.openedLabel.replace('Opened ', '')}</strong>
          <span>Open for</span>
        </div>
        <div>
          <strong>{dispute.messages.length}</strong>
          <span>Recent messages</span>
        </div>
      </div>

      <div className="cost-row" style={{ marginTop: 10 }}>
        <span className="muted">Reason given</span>
        <strong style={{ fontSize: 12 }}>{dispute.reason}</strong>
      </div>
      {dispute.description ? <p>{dispute.description}</p> : null}

      {dispute.evidenceUrls.length ? (
        <div className="specialty-list">
          {dispute.evidenceUrls.map((url, index) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              data-testid={`link-dispute-evidence-${dispute.id}-${index}`}
            >
              <span>Evidence {index + 1}</span>
            </a>
          ))}
        </div>
      ) : null}

      {dispute.messages.length ? (
        <div className="timeline" data-testid={`card-dispute-messages-${dispute.id}`}>
          {dispute.messages.map((message) => (
            <div className="timeline-row done" key={message.id}>
              <span className="timeline-dot" />
              <div>
                <strong>{message.isInternal ? 'Internal note' : 'From the parties'}</strong>
                <small>
                  {message.whenLabel} · {message.body}
                </small>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="form-field">
        <label htmlFor={`dispute-outcome-${dispute.id}`}>Outcome</label>
        <select
          id={`dispute-outcome-${dispute.id}`}
          value={outcome}
          onChange={(event) => {
            setOutcome(event.target.value as DisputeResolution);
            setConfirming(false);
          }}
          data-testid={`select-dispute-outcome-${dispute.id}`}
        >
          {DISPUTE_RESOLUTIONS.map((status) => (
            <option key={status} value={status}>
              {DISPUTE_RESOLUTION_COPY[status].label}
            </option>
          ))}
        </select>
        <span className="muted" style={{ fontSize: 11 }}>
          {DISPUTE_RESOLUTION_COPY[outcome].effect}
        </span>
      </div>

      <div className="form-field">
        <label htmlFor={`dispute-note-${dispute.id}`}>
          Resolution note <span>Sent to the customer</span>
        </label>
        <textarea
          id={`dispute-note-${dispute.id}`}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setConfirming(false);
          }}
          placeholder="What you found, and why this is the outcome."
          data-testid={`input-dispute-note-${dispute.id}`}
        />
      </div>

      <div className="form-field">
        <label htmlFor={`dispute-refund-${dispute.id}`}>
          Refund in rupees <span>Leave empty for no refund</span>
        </label>
        <input
          id={`dispute-refund-${dispute.id}`}
          value={refund}
          onChange={(event) => {
            setRefund(event.target.value);
            setConfirming(false);
          }}
          inputMode="decimal"
          placeholder="0"
          data-testid={`input-dispute-refund-${dispute.id}`}
        />
        <span className="muted" style={{ fontSize: 11 }}>
          {refundInvalid
            ? 'That is not an amount Zari can refund.'
            : refundOverPrice
              ? `More than the order was worth (${formatINR(dispute.finalPrice)}).`
              : refundPaise
                ? `${formatINR(refundPaise)} goes back to ${dispute.customerName}.`
                : 'Nothing is refunded.'}
        </span>
      </div>

      {confirming ? (
        <div className="guest-banner" data-testid={`card-dispute-confirm-${dispute.id}`}>
          <strong style={{ display: 'block', marginBottom: 4 }}>
            Resolve {dispute.orderCode} {DISPUTE_RESOLUTION_COPY[outcome].label.toLowerCase()}?
          </strong>
          <span style={{ lineHeight: 1.5 }}>
            {DISPUTE_RESOLUTION_COPY[outcome].effect}
            {refundPaise ? ` ${formatINR(refundPaise)} is refunded first.` : ''} The dispute closes
            and both sides are notified.
          </span>
        </div>
      ) : null}

      <div className="match-buttons">
        {confirming ? (
          <OpsButton
            variant="ghost"
            onClick={() => setConfirming(false)}
            testId={`button-dispute-cancel-${dispute.id}`}
          >
            Not yet
          </OpsButton>
        ) : null}
        <OpsButton
          variant={confirming ? 'coral' : 'primary'}
          onClick={submit}
          disabled={resolve.isPending}
          testId={`button-dispute-resolve-${dispute.id}`}
        >
          {resolve.isPending ? (
            <>
              <Loader2 size={14} className="spin" /> Recording…
            </>
          ) : (
            <>
              {confirming ? 'Yes, resolve it' : 'Resolve this dispute'} <ArrowRight size={14} />
            </>
          )}
        </OpsButton>
      </div>
    </article>
  );
}

export default function OpsDisputesPage() {
  const { data: disputes, isLive, isLoading } = useOpsDisputes();
  const [toast, setToast] = useState<ToastState>(null);

  const urgent = disputes.filter((d) => d.severity === 'urgent').length;

  return (
    <OpsShell section="DISPUTES">
      <div className="app-heading">
        <div>
          <div className="eyebrow">
            Disputes{isLoading ? ' · loading' : ''} <DemoNote isLive={isLive} />
          </div>
          <h1>Two accounts, one decision.</h1>
          <p>
            Read both sides, then close it. Resolving for the customer cancels the order; resolving
            for the designer or splitting completes it. A refund, if there is one, is sent first.
          </p>
        </div>
      </div>

      {urgent ? (
        <div className="guest-banner" data-testid="card-disputes-urgent">
          <ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {urgent} dispute{urgent === 1 ? ' has' : 's have'} been open three days or more. Both
          parties are waiting on us, not on each other.
        </div>
      ) : null}

      {disputes.length ? (
        <div style={{ display: 'grid', gap: 15, maxWidth: 860 }}>
          {disputes.map((dispute) => (
            <DisputeCard key={dispute.id} dispute={dispute} isLive={isLive} onToast={setToast} />
          ))}
        </div>
      ) : (
        <div className="empty-state" data-testid="card-disputes-empty">
          <MessageCircle size={23} />
          <h3>Nothing is in dispute.</h3>
          <p>When a customer or a designer raises one, the whole thread arrives here.</p>
        </div>
      )}

      <OpsToast toast={toast} setToast={setToast} />
    </OpsShell>
  );
}
