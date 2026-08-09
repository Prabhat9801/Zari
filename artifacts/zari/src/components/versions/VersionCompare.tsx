import { ArrowDownRight, ArrowUpRight, Loader2, Minus, X } from 'lucide-react';
import { formatINR, formatRange } from '@/types';
import {
  attributeLabel,
  describeValue,
  versionLabel,
  type VersionComparison,
} from './types';

/**
 * Two versions, side by side.
 *
 * The price difference is measured at the top of each range, because that is
 * the number a customer plans around. It is never shown as a bare colour: the
 * arrow, the word "more" or "less", and the sign all say the same thing, so it
 * reads the same to someone who cannot separate coral from teal.
 */

function EstimateColumn({
  label,
  versionNumber,
  estimate,
}: {
  label: string;
  versionNumber: number;
  estimate: { minTotal: number; maxTotal: number } | null;
}) {
  return (
    <div className="version-compare-column">
      <span className="eyebrow">
        {label} · {versionLabel(versionNumber)}
      </span>
      <strong className="mono">
        {estimate ? formatRange(estimate.minTotal, estimate.maxTotal) : 'Not priced yet'}
      </strong>
    </div>
  );
}

export default function VersionCompare({
  comparison,
  isLoading,
  detailsAvailable = true,
  onClear,
}: {
  comparison: VersionComparison;
  isLoading: boolean;
  /** False when the attribute diff could not be read and only the estimates are known. */
  detailsAvailable?: boolean;
  onClear: () => void;
}) {
  const { a, b, changes, priceDelta } = comparison;
  const direction = priceDelta > 0 ? 'up' : priceDelta < 0 ? 'down' : 'level';
  const DeltaIcon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;

  const deltaSentence =
    direction === 'level'
      ? 'The same at the top of the range.'
      : `${formatINR(Math.abs(priceDelta))} ${direction === 'up' ? 'more' : 'less'} at the top of the range.`;

  return (
    <div className="version-compare" data-testid="card-version-compare">
      <div className="version-compare-head">
        <div>
          <div className="eyebrow">Comparing</div>
          <strong>
            {versionLabel(a.versionNumber)} beside {versionLabel(b.versionNumber)}
          </strong>
        </div>
        <button
          className="icon-button"
          onClick={onClear}
          aria-label="Stop comparing"
          data-testid="button-version-compare-clear"
        >
          <X size={14} />
        </button>
      </div>

      <div className="version-compare-estimates">
        <EstimateColumn label="Before" versionNumber={a.versionNumber} estimate={a.costEstimate} />
        <EstimateColumn label="After" versionNumber={b.versionNumber} estimate={b.costEstimate} />
      </div>

      <div className={`version-delta version-delta-${direction}`} data-testid="status-version-price-delta">
        <DeltaIcon size={15} />
        <span>
          <b>
            {direction === 'up' ? '+' : direction === 'down' ? '−' : ''}
            {direction === 'level' ? '' : formatINR(Math.abs(priceDelta))}
          </b>{' '}
          {deltaSentence}
        </span>
      </div>

      {isLoading ? (
        <p className="version-compare-loading muted" role="status">
          <Loader2 size={13} className="spin" /> Reading both versions…
        </p>
      ) : null}

      {changes.length ? (
        <ul className="version-change-list">
          {changes.map((change) => (
            <li
              className="version-change"
              key={change.attribute}
              data-testid={`card-version-change-${change.attribute}`}
            >
              <span className="version-change-name">{attributeLabel(change.attribute)}</span>
              <span className="version-change-from">{describeValue(change.from)}</span>
              <span className="version-change-arrow" aria-hidden="true">
                →
              </span>
              <span className="version-change-to">{describeValue(change.to)}</span>
            </li>
          ))}
        </ul>
      ) : isLoading ? null : detailsAvailable ? (
        <p className="muted version-compare-empty">
          Nothing in the garment itself differs between these two.
        </p>
      ) : (
        <p className="muted version-compare-empty">
          Zari couldn't read the attribute-by-attribute difference just now, so only the estimates
          are compared here. Both versions are untouched.
        </p>
      )}

      <p className="muted version-compare-foot">
        Both versions stay exactly as they are. Comparing changes nothing.
      </p>
    </div>
  );
}
