import { ArrowRight, Lock } from 'lucide-react';
import { COMPONENT_LABELS, savingOf, type BudgetSubstitution } from '@/services/budget';
import { formatINR } from '@/types';

/**
 * One substitution, in full.
 *
 * The visual impact line is the entire point of this feature and is never
 * hidden behind a tooltip, a hover, or a "read more". Neither is the reason a
 * structural change cannot be switched off — a disabled checkbox with no
 * explanation is exactly the kind of quiet refusal this product is against.
 */

export function SubstitutionRow({
  substitution,
  selected,
  disabled,
  planLabel,
  onToggle,
}: {
  substitution: BudgetSubstitution;
  selected: boolean;
  /** True while the panel is read-only — mid-request, or applying. */
  disabled: boolean;
  planLabel: string;
  onToggle: () => void;
}) {
  const sub = substitution;
  const locked = !sub.isOptional;
  const inputId = `substitution-${sub.id}`;

  return (
    <div
      className="bo-substitution"
      data-selected={selected}
      data-locked={locked}
      data-testid={`card-substitution-${sub.id}`}
    >
      <div className="bo-substitution-head">
        <input
          id={inputId}
          type="checkbox"
          className="bo-toggle"
          checked={selected}
          disabled={locked || disabled}
          onChange={onToggle}
          aria-label={`${sub.fromValue} to ${sub.toValue}`}
          aria-describedby={`${inputId}-impact`}
          data-testid={`toggle-substitution-${sub.id}`}
        />
        <label className="bo-swap" htmlFor={inputId}>
          <span className="bo-from">{sub.fromValue}</span>
          <ArrowRight size={13} aria-hidden="true" />
          <b>{sub.toValue}</b>
        </label>
        <span className="bo-delta mono">Saves {formatINR(savingOf(sub))}</span>
      </div>

      <p className="bo-impact" id={`${inputId}-impact`}>
        {sub.visualImpact}
      </p>

      <div className="bo-substitution-meta">
        <span className="bo-component">{COMPONENT_LABELS[sub.component] ?? 'Other'}</span>
        <span>
          Costs {sub.similarityDelta} similarity point{sub.similarityDelta === 1 ? '' : 's'}
        </span>
        {locked ? (
          <span className="bo-locked-chip">
            <Lock size={11} aria-hidden="true" /> Always on
          </span>
        ) : null}
      </div>

      {locked ? (
        <p className="bo-locked-why" data-testid={`text-locked-${sub.id}`}>
          This one is structural. Everything else in {planLabel} is priced around it, so turning it
          off would not give you the old {sub.fromValue} back — it would give you a different plan.
          Choose another option if you would rather keep it.
        </p>
      ) : null}
    </div>
  );
}

export default SubstitutionRow;
