import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { DemoNote, DesignerShell } from './_shared';
import { useDesignerQuality } from '@/hooks/useDesigner';

/**
 * Quality Score, explained to the person it is about.
 *
 * The weights are public at /api/marketplace/scoring, so this page reads them
 * from the API rather than restating them from memory — if the policy changes,
 * this screen changes with it. Price is not an input, and there is no paid
 * placement; both are stated plainly rather than implied.
 */
export default function DesignerQuality() {
  const { data, isLive } = useDesignerQuality();

  // The score is a weighted average, so it can be shown as arithmetic rather
  // than asserted. A component with no history yet is left out of the sum.
  const measured = data.components.filter((component) => component.value !== null);
  const workings = measured
    .map((component) => `${component.value} × ${component.weightPercent}%`)
    .join('  +  ');

  return (
    <DesignerShell studioName={data.studioName} breadcrumb="Quality">
      <div className="app-heading">
        <div>
          <div className="eyebrow">
            Designer space / quality <DemoNote isLive={isLive} />
          </div>
          <h1>Nothing about this score is hidden.</h1>
          <p>
            Five signals, five published weights, recomputed after every quality check, delivery and
            review.
          </p>
        </div>
        <div className="profile-score-card">
          <div className="eyebrow">Zari Quality Score</div>
          <strong>{data.qualityScore}</strong>
          <span>{data.scoreLabel}</span>
          {data.measuredLabel && (
            <span className="mono" style={{ fontSize: 10, opacity: 0.75 }}>
              {data.measuredLabel}
            </span>
          )}
        </div>
      </div>

      <div className="profile-metrics">
        <div>
          <span>On-time delivery</span>
          <strong>{data.stats.onTimePercent}%</strong>
        </div>
        <div>
          <span>Fit success</span>
          <strong>{data.stats.fitSuccessPercent}%</strong>
        </div>
        <div>
          <span>Completed orders</span>
          <strong>{data.stats.completedOrders}</strong>
        </div>
        <div>
          <span>Customer rating</span>
          <strong>
            {data.stats.rating} / 5{' '}
            <small className="muted" style={{ fontSize: 11 }}>
              ({data.stats.reviewsCount})
            </small>
          </strong>
        </div>
      </div>

      <div className="profile-content">
        <div>
          <div className="subheading">
            <h2>What the score is made of</h2>
            <span className="eyebrow">Weights are public</span>
          </div>

          <div className="surface profile-panel">
            {data.components.map((component) => (
              <div
                key={component.key}
                style={{ marginBottom: 18 }}
                data-testid={`card-quality-component-${component.key}`}
              >
                <div className="score-breakdown" style={{ borderTop: 0, paddingBottom: 8 }}>
                  <span>
                    {component.label}
                    <small className="muted"> · {component.weightPercent}% of the score</small>
                  </span>
                  <strong>{component.value === null ? '—' : component.value}</strong>
                </div>
                <div className="progress-line">
                  <span style={{ width: `${component.value ?? 0}%` }} />
                </div>
                <p className="muted" style={{ fontSize: 11, lineHeight: 1.45, margin: '9px 0 0' }}>
                  {component.source}
                </p>
              </div>
            ))}
          </div>

          <div className="surface profile-panel" style={{ marginTop: 15 }}>
            <div className="eyebrow">The arithmetic</div>
            <p className="mono" style={{ fontSize: 11, lineHeight: 1.7, margin: '12px 0' }}>
              {measured.length ? `${workings}  =  ${data.qualityScore}` : 'Not enough history yet.'}
            </p>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>
              A studio with fewer than three completed orders is held near 60 rather than shown as a
              zero. A short record is a short record, not a bad one. As real orders land, the damping
              lifts and your own numbers take over.
            </p>
          </div>
        </div>

        <aside className="profile-sidebar">
          <div className="surface profile-panel">
            <div className="eyebrow">Where you appear in matches</div>
            <p className="muted">
              Ranking is a separate calculation from the score, and just as public.
            </p>
            {data.matching.map((component) => (
              <div
                className="score-breakdown"
                key={component.key}
                data-testid={`card-matching-weight-${component.key}`}
              >
                <span>{component.label}</span>
                <strong>{component.weightPercent}%</strong>
              </div>
            ))}
          </div>

          <div className="profile-trust">
            <ShieldCheck size={16} />
            <span>{data.qualityNote}</span>
          </div>

          <div className="profile-trust">
            <ShieldCheck size={16} />
            <span>{data.matchingNote}</span>
          </div>

          <div className="surface profile-panel">
            <div className="eyebrow">What moves it next</div>
            <p className="muted" style={{ marginBottom: 0 }}>
              Delivering by the date you promised, and passing quality control the first time, are
              the two heaviest things you control. Both are recomputed the moment the order closes.
            </p>
            <Link href="/designer" className="text-link" data-testid="link-quality-dashboard">
              Back to your dashboard <ArrowRight size={12} />
            </Link>
          </div>
        </aside>
      </div>
    </DesignerShell>
  );
}
