import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Check, Eye, Loader2, ShieldCheck, UsersRound, X } from 'lucide-react';
import { usePendingVerifications, useVerifyDesigner } from '@/hooks/useOps';
import type { VerificationDecision, VerificationView } from '@/services/ops';
import {
  DemoNote,
  OpsButton,
  OpsShell,
  OpsToast,
  Pill,
  liveOnlyMessage,
  messageFor,
  type PillTone,
  type ToastState,
} from './OpsShell';

/**
 * Studio verification.
 *
 * A studio stays out of designer matching until someone here has read it, so
 * the cost of leaving this queue alone is a real person not getting work. The
 * three outcomes are shown together, with what each one does spelled out.
 */

const STATUS_TONES: Record<string, PillTone> = {
  PENDING: 'warning',
  IN_REVIEW: 'neutral',
  VERIFIED: 'positive',
  REJECTED: 'critical',
};

const DECISION_COPY: Record<VerificationDecision, { label: string; effect: string }> = {
  IN_REVIEW: {
    label: 'Keep in review',
    effect: 'Tells the studio we are looking, and leaves it out of matching.',
  },
  VERIFIED: {
    label: 'Verify the studio',
    effect: 'Lets the studio appear in designer matches and recomputes its Quality Score.',
  },
  REJECTED: {
    label: 'Reject',
    effect: 'Closes the submission. Your note is the only explanation they receive.',
  },
};

function VerificationCard({
  verification,
  isLive,
  onToast,
}: {
  verification: VerificationView;
  isLive: boolean;
  onToast: (toast: ToastState) => void;
}) {
  const verify = useVerifyDesigner();
  const [notes, setNotes] = useState(verification.reviewNotes);
  const [pending, setPending] = useState<VerificationDecision | null>(null);

  const decide = (status: VerificationDecision) => {
    if (!isLive) {
      onToast({ message: liveOnlyMessage });
      return;
    }
    if (status === 'REJECTED' && !notes.trim()) {
      onToast({ message: 'A rejection needs a note. It is the only explanation the studio gets.' });
      return;
    }
    if (pending !== status) {
      setPending(status);
      return;
    }
    verify.mutate(
      { designerId: verification.designerId, status, reviewNotes: notes.trim() || null },
      {
        onSuccess: () => {
          setPending(null);
          onToast({
            message:
              status === 'VERIFIED'
                ? `${verification.studioName} is verified and can be matched.`
                : status === 'REJECTED'
                  ? `${verification.studioName} has been told what is missing.`
                  : `${verification.studioName} is marked in review.`,
          });
        },
        onError: (error) => {
          setPending(null);
          onToast({
            message: messageFor(error, "Zari couldn't record that review. Nothing is lost — try again."),
          });
        },
      },
    );
  };

  const waiting =
    verification.waitingDays === 0
      ? 'Submitted today'
      : `Waiting ${verification.waitingDays} day${verification.waitingDays === 1 ? '' : 's'}`;

  return (
    <article
      className="match-card"
      style={{
        borderLeft:
          verification.waitingDays >= 5
            ? '3px solid hsl(var(--accent))'
            : '3px solid hsl(var(--primary) / .35)',
      }}
      data-testid={`card-verification-${verification.designerId}`}
    >
      <div className="match-top">
        <span className="avatar">{verification.initials}</span>
        <div>
          <strong>{verification.studioName}</strong>
          <span>
            {verification.city || 'City not given'} · {verification.submittedLabel}
          </span>
        </div>
        <span style={{ marginLeft: 'auto' }}>
          <Pill tone={STATUS_TONES[verification.status] ?? 'neutral'}>
            {verification.statusLabel}
          </Pill>
        </span>
      </div>

      <div className="match-stats">
        <div>
          <strong>{verification.portfolio.length}</strong>
          <span>Work samples</span>
        </div>
        <div>
          <strong>{verification.documents.length}</strong>
          <span>Documents</span>
        </div>
        <div>
          <strong>{waiting.replace('Waiting ', '')}</strong>
          <span>In the queue</span>
        </div>
      </div>

      {verification.documents.length ? (
        <div className="specialty-list">
          {verification.documents.map((doc, index) =>
            doc.url ? (
              <a
                key={`${doc.label}-${index}`}
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                data-testid={`link-verification-document-${verification.designerId}-${index}`}
              >
                <span>{doc.label}</span>
              </a>
            ) : (
              <span key={`${doc.label}-${index}`}>{doc.label} · not uploaded</span>
            ),
          )}
        </div>
      ) : (
        <p style={{ marginTop: 14 }}>
          No documents have been uploaded yet. Keeping this in review is usually the right call.
        </p>
      )}

      {verification.portfolio.length ? (
        <div className="specialty-list">
          {verification.portfolio.map((piece, index) => (
            <span key={`${piece.title}-${index}`}>{piece.title}</span>
          ))}
        </div>
      ) : null}

      <div className="form-field" style={{ marginTop: 18 }}>
        <label htmlFor={`verification-notes-${verification.designerId}`}>
          Review note <span>The studio reads this</span>
        </label>
        <textarea
          id={`verification-notes-${verification.designerId}`}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
            setPending(null);
          }}
          placeholder="What you checked, and anything still missing."
          data-testid={`input-verification-notes-${verification.designerId}`}
        />
      </div>

      {pending ? (
        <div className="guest-banner" data-testid={`card-verification-confirm-${verification.designerId}`}>
          <strong style={{ display: 'block', marginBottom: 4 }}>
            {DECISION_COPY[pending].label} — {verification.studioName}?
          </strong>
          <span style={{ lineHeight: 1.5 }}>{DECISION_COPY[pending].effect}</span>
        </div>
      ) : null}

      <div className="match-buttons">
        <OpsButton
          variant="ghost"
          onClick={() => decide('IN_REVIEW')}
          disabled={verify.isPending}
          testId={`button-verification-in-review-${verification.designerId}`}
        >
          <Eye size={14} /> {pending === 'IN_REVIEW' ? 'Confirm review' : 'Keep in review'}
        </OpsButton>
        <OpsButton
          variant="ghost"
          onClick={() => decide('REJECTED')}
          disabled={verify.isPending}
          testId={`button-verification-reject-${verification.designerId}`}
        >
          <X size={14} /> {pending === 'REJECTED' ? 'Confirm rejection' : 'Reject'}
        </OpsButton>
        <OpsButton
          variant="coral"
          onClick={() => decide('VERIFIED')}
          disabled={verify.isPending}
          testId={`button-verification-verify-${verification.designerId}`}
        >
          {verify.isPending ? (
            <>
              <Loader2 size={14} className="spin" /> Saving…
            </>
          ) : (
            <>
              <Check size={14} /> {pending === 'VERIFIED' ? 'Confirm verify' : 'Verify studio'}
            </>
          )}
        </OpsButton>
      </div>

      {verification.slug ? (
        <Link
          href={`/designers/${verification.slug}`}
          className="text-link"
          style={{ marginTop: 14 }}
          data-testid={`link-verification-profile-${verification.designerId}`}
        >
          Open the public profile <ArrowRight size={13} />
        </Link>
      ) : null}
    </article>
  );
}

export default function OpsDesignersPage() {
  const { data: verifications, isLive, isLoading } = usePendingVerifications();
  const [toast, setToast] = useState<ToastState>(null);

  return (
    <OpsShell section="VERIFICATIONS">
      <div className="app-heading">
        <div>
          <div className="eyebrow">
            Studio verification{isLoading ? ' · loading' : ''} <DemoNote isLive={isLive} />
          </div>
          <h1>Who gets to make things here.</h1>
          <p>
            Identity, studio location, and work samples. Until a studio is verified it cannot appear
            in a single designer match, so a slow queue costs someone their work.
          </p>
        </div>
      </div>

      <div className="guest-banner">
        <ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Verifying a studio also recomputes its Quality Score. Rejecting sends only your note — write
        it as though the person is reading it, because they are.
      </div>

      {verifications.length ? (
        <div className="quote-list" style={{ display: 'grid', gap: 15, maxWidth: 860 }}>
          {verifications.map((verification) => (
            <VerificationCard
              key={verification.id}
              verification={verification}
              isLive={isLive}
              onToast={setToast}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state" data-testid="card-verifications-empty">
          <UsersRound size={23} />
          <h3>No studio is waiting on us.</h3>
          <p>New submissions arrive here as soon as a studio finishes its profile.</p>
        </div>
      )}

      <OpsToast toast={toast} setToast={setToast} />
    </OpsShell>
  );
}
