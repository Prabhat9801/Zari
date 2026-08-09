import { useEffect, useState } from 'react';
import { ArrowRight, Camera, Check, ImagePlus, Loader2, ShieldCheck, Trash2, X } from 'lucide-react';
import { formatINR } from '@/types';
import { useAddQcPhotos, useDecideQc, useQcQueue, useStartQcRound } from '@/hooks/useOps';
import {
  QC_CRITERIA,
  QC_CRITERION_COPY,
  QC_PHOTO_VIEWS,
  type QcCheckView,
  type QcCriterion,
  type QcPhotoInput,
  type QcPhotoViewName,
} from '@/services/ops';
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
 * The quality control queue.
 *
 * This is the most consequential screen in the product: passing all five
 * criteria is the one and only thing that releases the escrow balance to a
 * designer. The screen is built so that fact is impossible to miss — stated
 * before the decision, restated in the confirmation, and never abbreviated.
 */

type DecisionMap = Record<QcCriterion, { passed: boolean | null; note: string }>;

const blankDecisions = (): DecisionMap => {
  const map = {} as DecisionMap;
  for (const criterion of QC_CRITERIA) map[criterion] = { passed: null, note: '' };
  return map;
};

const decisionsFrom = (check: QcCheckView | undefined): DecisionMap => {
  const map = blankDecisions();
  for (const item of check?.items ?? []) {
    map[item.criterion] = { passed: item.passed, note: item.note };
  }
  return map;
};

const STATUS_TONES: Record<string, PillTone> = {
  NOT_STARTED: 'quiet',
  IN_REVIEW: 'warning',
  PASSED: 'positive',
  PASSED_WITH_NOTES: 'positive',
  FAILED: 'critical',
};

/** Keeps the order context from the queue row when a write returns a bare check. */
const withContext = (fresh: QcCheckView, source: QcCheckView): QcCheckView => ({
  ...source,
  id: fresh.id,
  orderId: fresh.orderId || source.orderId,
  round: fresh.round,
  status: fresh.status,
  statusLabel: fresh.statusLabel,
  items: fresh.items,
  photos: fresh.photos.length ? fresh.photos : source.photos,
  aiSimilarityScore: fresh.aiSimilarityScore ?? source.aiSimilarityScore,
  overallNote: fresh.overallNote,
});

export default function OpsQcQueuePage() {
  const { data: queue, isLive, isLoading } = useQcQueue();
  const startRound = useStartQcRound();
  const addPhotos = useAddQcPhotos();
  const decide = useDecideQc();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [active, setActive] = useState<QcCheckView | null>(null);
  const [decisions, setDecisions] = useState<DecisionMap>(blankDecisions);
  const [overallNote, setOverallNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoView, setPhotoView] = useState<QcPhotoViewName>('FRONT');
  const [staged, setStaged] = useState<QcPhotoInput[]>([]);
  const [confirm, setConfirm] = useState<'pass' | 'fail' | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const selected = queue.find((c) => c.id === selectedId) ?? queue[0];
  const check = active && selected && active.id === selected.id ? active : selected;

  const checkId = check?.id;
  useEffect(() => {
    setDecisions(decisionsFrom(check));
    setOverallNote(check?.overallNote ?? '');
    setStaged([]);
    setConfirm(null);
    // Resetting on the selected check, not on every render of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkId]);

  const open = (item: QcCheckView) => {
    setSelectedId(item.id);
    setActive(null);
  };

  const guard = (): boolean => {
    if (isLive) return true;
    setToast({ message: liveOnlyMessage });
    return false;
  };

  const reviewable = check?.status === 'IN_REVIEW';
  const allMarked = QC_CRITERIA.every((c) => decisions[c].passed !== null);
  const willPass = allMarked && QC_CRITERIA.every((c) => decisions[c].passed === true);
  const failedList = QC_CRITERIA.filter((c) => decisions[c].passed === false);

  const mark = (criterion: QcCriterion, passed: boolean) => {
    setConfirm(null);
    setDecisions((current) => ({ ...current, [criterion]: { ...current[criterion], passed } }));
  };

  const note = (criterion: QcCriterion, value: string) =>
    setDecisions((current) => ({ ...current, [criterion]: { ...current[criterion], note: value } }));

  const beginRound = () => {
    if (!check || !guard()) return;
    startRound.mutate(check.orderId, {
      onSuccess: (result) => {
        setActive(withContext(result, check));
        setSelectedId(check.id);
        setDecisions(blankDecisions());
        setToast({ message: `Round ${result.round} is open on ${check.orderCode}.` });
      },
      onError: (error) =>
        setToast({
          message: messageFor(error, "Zari couldn't open that review round. Nothing is lost — try again."),
        }),
    });
  };

  const stagePhoto = () => {
    const url = photoUrl.trim();
    if (!url) {
      setToast({ message: 'Paste the address of a quality control photograph first.' });
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setToast({ message: 'A photo address needs to start with http:// or https://.' });
      return;
    }
    setStaged((current) => [...current, { url, view: photoView }]);
    setPhotoUrl('');
  };

  const uploadPhotos = () => {
    if (!check || !staged.length || !guard()) return;
    addPhotos.mutate(
      { checkId: check.id, photos: staged },
      {
        onSuccess: (result) => {
          setActive(withContext(result.check, check));
          setStaged([]);
          setToast({
            message:
              result.aiSimilarityScore === null
                ? 'Photographs attached. The similarity read did not run, so judge by eye.'
                : `Photographs attached. Similarity reads ${result.aiSimilarityScore}% — advisory only.`,
          });
        },
        onError: (error) =>
          setToast({
            message: messageFor(error, "Zari couldn't attach those photographs. Try again."),
          }),
      },
    );
  };

  const submitDecision = () => {
    if (!check || !guard()) return;
    decide.mutate(
      {
        checkId: check.id,
        decision: {
          items: QC_CRITERIA.map((criterion) => ({
            criterion,
            passed: decisions[criterion].passed === true,
            note: decisions[criterion].note.trim() || undefined,
          })),
          overallNote: overallNote.trim() || undefined,
        },
      },
      {
        onSuccess: (result) => {
          setActive(withContext(result, check));
          setConfirm(null);
          setToast({
            message:
              result.status === 'PASSED'
                ? `${check.orderCode} passed. The escrow balance is released to ${check.studioName}.`
                : `${check.orderCode} is marked for correction. ${check.studioName} has been told what to fix.`,
          });
        },
        onError: (error) =>
          setToast({
            message: messageFor(error, "Zari couldn't record that decision. Nothing is lost — try again."),
          }),
      },
    );
  };

  return (
    <OpsShell section="QUALITY CONTROL">
      <div className="app-heading">
        <div>
          <div className="eyebrow">
            Quality control{isLoading ? ' · loading' : ''} <DemoNote isLive={isLive} />
          </div>
          <h1>The garment against the promise.</h1>
          <p>
            Five criteria, checked by a person. A pass releases the escrow balance to the designer —
            it is the only thing in Zari that does.
          </p>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="empty-state" data-testid="card-qc-empty">
          <ShieldCheck size={23} />
          <h3>Nothing is waiting on a check.</h3>
          <p>When a designer marks a garment finished, the round appears here.</p>
        </div>
      ) : (
        <div className="marketplace-grid">
          <section>
            <div className="subheading">
              <h2>In the queue</h2>
              <span className="eyebrow">{queue.length} waiting</span>
            </div>
            <div style={{ display: 'grid', gap: 11 }}>
              {queue.map((item) => (
                <button
                  key={item.id}
                  onClick={() => open(item)}
                  className={`match-card ${check?.id === item.id ? 'featured' : ''}`}
                  style={{ textAlign: 'left', width: '100%', cursor: 'pointer', display: 'block' }}
                  data-testid={`card-qc-check-${item.id}`}
                >
                  <div className="match-top">
                    <span className="avatar">{item.round}</span>
                    <div>
                      <strong>{item.orderCode || 'Order'}</strong>
                      <span>{item.studioName}</span>
                    </div>
                    <span style={{ marginLeft: 'auto' }}>
                      <Pill tone={STATUS_TONES[item.status] ?? 'neutral'}>{item.statusLabel}</Pill>
                    </span>
                  </div>
                  <p style={{ margin: '12px 0 8px' }}>{item.designTitle}</p>
                  <div className="cost-row" style={{ padding: 0 }}>
                    <span className="muted">{item.waitingLabel}</span>
                    <span className="mono">{formatINR(item.finalPrice)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {check ? (
            <section style={{ display: 'grid', gap: 15, alignContent: 'start' }}>
              <div className="surface studio-card">
                <div className="eyebrow">
                  {check.orderCode} · round {check.round}
                </div>
                <h2 style={{ font: '400 31px var(--app-font-serif)', margin: '10px 0 7px' }}>
                  {check.designTitle}
                </h2>
                <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 0 }}>
                  {check.studioName}
                  {check.city ? ` · ${check.city}` : ''}
                  {check.qualityScore === null ? '' : ` · Quality Score ${check.qualityScore}`}
                </p>
                <div className="cost-row">
                  <span>Order total</span>
                  <span className="mono">{formatINR(check.finalPrice)}</span>
                </div>
                <div className="cost-row">
                  <span>Promised delivery</span>
                  <span>{check.promisedLabel || 'Not set'}</span>
                </div>
                <div className="cost-row">
                  <span>Similarity read</span>
                  <span>
                    {check.aiSimilarityScore === null
                      ? 'Not run'
                      : `${check.aiSimilarityScore}% · advisory`}
                  </span>
                </div>
                <p className="muted" style={{ fontSize: 11, lineHeight: 1.5, margin: '14px 0 0' }}>
                  The similarity read is a machine hint against the approved version. It never
                  decides anything on its own.
                </p>
              </div>

              <div className="escrow surface" data-testid="card-qc-escrow-warning">
                <div className="eyebrow" style={{ color: 'hsl(39 42% 86%)' }}>
                  What a pass does
                </div>
                <h3>It releases the money.</h3>
                <p>
                  Passing all five criteria releases the escrow balance held against{' '}
                  {check.orderCode || 'this order'} to {check.studioName}. It is the only action in
                  Zari that moves that money, and it cannot be taken back from this console.
                </p>
                <div className="escrow-row">
                  <span>Order total in escrow</span>
                  <strong>{formatINR(check.finalPrice)}</strong>
                </div>
                <div className="escrow-row">
                  <span>Failing instead</span>
                  <strong>Correction requested</strong>
                </div>
              </div>

              {check.status !== 'IN_REVIEW' ? (
                <div className="surface studio-card">
                  <h3>This round is {check.statusLabel.toLowerCase()}</h3>
                  <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 0 }}>
                    Open a new round to review the garment again. That moves the order back into
                    quality check and starts a fresh set of five criteria.
                  </p>
                  <OpsButton
                    onClick={beginRound}
                    disabled={startRound.isPending}
                    testId="button-start-qc-round"
                  >
                    {startRound.isPending ? (
                      <>
                        <Loader2 size={14} className="spin" /> Opening…
                      </>
                    ) : (
                      <>
                        Open round {check.round + 1} <ArrowRight size={14} />
                      </>
                    )}
                  </OpsButton>
                </div>
              ) : null}

              <div className="surface studio-card">
                <h3>
                  <Camera size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Photographs of the finished garment
                </h3>
                <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 0 }}>
                  Front, back, a detail of the surface work, and the tag. Attaching them also runs
                  the similarity read against the approved version.
                </p>

                {check.photos.length ? (
                  <div className="specialty-list" data-testid="card-qc-photos">
                    {check.photos.map((photo) => (
                      <a
                        key={photo.id}
                        href={photo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-link"
                        style={{ fontSize: 11 }}
                        data-testid={`link-qc-photo-${photo.id}`}
                      >
                        {photo.view || 'PHOTO'} <ArrowRight size={11} />
                      </a>
                    ))}
                  </div>
                ) : null}

                <div className="form-grid" style={{ marginTop: 16 }}>
                  <div className="form-field">
                    <label htmlFor="qc-photo-url">Photograph address</label>
                    <input
                      id="qc-photo-url"
                      value={photoUrl}
                      onChange={(event) => setPhotoUrl(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') stagePhoto();
                      }}
                      placeholder="https://…"
                      data-testid="input-qc-photo-url"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="qc-photo-view">View</label>
                    <select
                      id="qc-photo-view"
                      value={photoView}
                      onChange={(event) => setPhotoView(event.target.value as QcPhotoViewName)}
                      data-testid="select-qc-photo-view"
                    >
                      {QC_PHOTO_VIEWS.map((view) => (
                        <option key={view} value={view}>
                          {view}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {staged.length ? (
                  <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                    {staged.map((photo, index) => (
                      <div className="cost-row" key={`${photo.url}-${index}`}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {photo.view} · {photo.url}
                        </span>
                        <button
                          className="icon-button"
                          style={{ width: 26, height: 26 }}
                          aria-label="Remove photograph"
                          onClick={() => setStaged((c) => c.filter((_, i) => i !== index))}
                          data-testid={`button-remove-staged-photo-${index}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="studio-actions">
                  <OpsButton variant="ghost" onClick={stagePhoto} testId="button-stage-qc-photo">
                    <ImagePlus size={14} /> Add to the set
                  </OpsButton>
                  <OpsButton
                    onClick={uploadPhotos}
                    disabled={!staged.length || addPhotos.isPending}
                    testId="button-upload-qc-photos"
                  >
                    {addPhotos.isPending ? (
                      <>
                        <Loader2 size={14} className="spin" /> Attaching…
                      </>
                    ) : (
                      <>Attach {staged.length || ''} to the round</>
                    )}
                  </OpsButton>
                </div>
              </div>

              <div className="surface studio-card">
                <h3>The five criteria</h3>
                <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 0 }}>
                  All five must be marked. One failure sends the garment back for correction and
                  leaves the money where it is.
                </p>

                {QC_CRITERIA.map((criterion) => {
                  const state = decisions[criterion];
                  const copy = QC_CRITERION_COPY[criterion];
                  return (
                    <div
                      key={criterion}
                      style={{
                        borderTop: '1px solid hsl(var(--border))',
                        paddingTop: 14,
                        marginTop: 14,
                        borderLeft:
                          state.passed === null
                            ? '3px solid transparent'
                            : state.passed
                              ? '3px solid hsl(var(--primary))'
                              : '3px solid hsl(var(--destructive))',
                        paddingLeft: 12,
                        marginLeft: -12,
                      }}
                      data-testid={`card-qc-criterion-${criterion}`}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: 13 }}>{copy.label}</strong>
                          <p
                            className="muted"
                            style={{ fontSize: 11, lineHeight: 1.45, margin: '4px 0 0' }}
                          >
                            {copy.help}
                          </p>
                        </div>
                        <div className="view-controls" style={{ flexShrink: 0 }}>
                          <button
                            className={state.passed === true ? 'active' : ''}
                            onClick={() => mark(criterion, true)}
                            disabled={!reviewable}
                            data-testid={`button-qc-pass-${criterion}`}
                          >
                            <Check size={12} /> pass
                          </button>
                          <button
                            className={state.passed === false ? 'active' : ''}
                            onClick={() => mark(criterion, false)}
                            disabled={!reviewable}
                            style={
                              state.passed === false
                                ? {
                                    background: 'hsl(var(--destructive))',
                                    color: 'hsl(var(--destructive-foreground))',
                                  }
                                : undefined
                            }
                            data-testid={`button-qc-fail-${criterion}`}
                          >
                            <X size={12} /> fail
                          </button>
                        </div>
                      </div>
                      <div className="form-field" style={{ marginTop: 10, marginBottom: 0 }}>
                        <label htmlFor={`qc-note-${criterion}`}>
                          Note <span>What the designer needs to know</span>
                        </label>
                        <input
                          id={`qc-note-${criterion}`}
                          value={state.note}
                          onChange={(event) => note(criterion, event.target.value)}
                          disabled={!reviewable}
                          placeholder={
                            state.passed === false
                              ? 'Describe exactly what to correct'
                              : 'Optional'
                          }
                          data-testid={`input-qc-note-${criterion}`}
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="form-field" style={{ marginTop: 18 }}>
                  <label htmlFor="qc-overall-note">Note on the round</label>
                  <textarea
                    id="qc-overall-note"
                    value={overallNote}
                    onChange={(event) => setOverallNote(event.target.value)}
                    disabled={!reviewable}
                    placeholder="Anything the customer and the designer should both read."
                    data-testid="input-qc-overall-note"
                  />
                </div>

                {reviewable ? (
                  confirm === null ? (
                    <>
                      <div className="cost-total">
                        <span className="muted" style={{ fontSize: 11 }}>
                          {allMarked
                            ? willPass
                              ? 'All five pass'
                              : `${failedList.length} of five need correction`
                            : 'Mark all five to decide'}
                        </span>
                        <strong style={{ font: '400 22px var(--app-font-serif)' }}>
                          {allMarked
                            ? willPass
                              ? formatINR(check.finalPrice)
                              : 'No money moves'
                            : '—'}
                        </strong>
                      </div>
                      <OpsButton
                        variant={willPass ? 'coral' : 'primary'}
                        onClick={() => setConfirm(willPass ? 'pass' : 'fail')}
                        disabled={!allMarked}
                        testId="button-qc-record-decision"
                      >
                        {willPass
                          ? 'Pass and release the balance'
                          : allMarked
                            ? 'Fail and request a correction'
                            : 'Record the decision'}{' '}
                        <ArrowRight size={14} />
                      </OpsButton>
                    </>
                  ) : (
                    <div
                      className="guest-banner"
                      style={{ marginTop: 18, marginBottom: 0 }}
                      data-testid="card-qc-confirm"
                    >
                      <strong style={{ display: 'block', marginBottom: 6 }}>
                        {confirm === 'pass'
                          ? `Release ${formatINR(check.finalPrice)} worth of escrow to ${check.studioName}?`
                          : `Send ${check.orderCode} back to ${check.studioName} for correction?`}
                      </strong>
                      <span style={{ display: 'block', marginBottom: 12, lineHeight: 1.5 }}>
                        {confirm === 'pass'
                          ? 'The balance held against this order moves to the designer, the customer is told it passed, and this round closes. There is no way to reverse it here.'
                          : `${failedList.length} criteri${failedList.length === 1 ? 'on' : 'a'} will be sent back with your notes. The money stays held.`}
                      </span>
                      <div className="studio-actions">
                        <OpsButton
                          variant="ghost"
                          onClick={() => setConfirm(null)}
                          testId="button-qc-cancel-decision"
                        >
                          Not yet
                        </OpsButton>
                        <OpsButton
                          variant={confirm === 'pass' ? 'coral' : 'primary'}
                          onClick={submitDecision}
                          disabled={decide.isPending}
                          testId="button-qc-confirm-decision"
                        >
                          {decide.isPending ? (
                            <>
                              <Loader2 size={14} className="spin" /> Recording…
                            </>
                          ) : confirm === 'pass' ? (
                            'Yes, release the balance'
                          ) : (
                            'Yes, request the correction'
                          )}
                        </OpsButton>
                      </div>
                    </div>
                  )
                ) : (
                  <p className="muted" style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 0 }}>
                    This round is {check.statusLabel.toLowerCase()}, so the criteria are read-only.
                  </p>
                )}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <OpsToast toast={toast} setToast={setToast} />
    </OpsShell>
  );
}
