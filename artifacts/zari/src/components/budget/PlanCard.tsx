import { Check, Loader2 } from 'lucide-react';
import { SubstitutionRow } from './SubstitutionRow';
import { BudgetButton } from './BudgetChrome';
import type { BudgetLiveTotals, BudgetPlan, BudgetRun } from '@/services/budget';
import { formatINR, formatRange } from '@/types';

/**
 * One plan.
 *
 * The three headline figures — similarity, saving, resulting estimate — are the
 * live ones, recomputed on every toggle, so the card can never claim a price
 * that no longer matches the switches under it. The resulting price is a RANGE,
 * because it is still an estimate; a bid and a final price are point values and
 * this screen never blurs the three.
 */

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Says plainly where the plan lands against what the customer asked for. */
function targetVerdict(live: BudgetLiveTotals, targetAmount: number): { text: string; met: boolean } {
  if (live.resultingMax <= targetAmount) {
    return { text: `Within your target of ${formatINR(targetAmount)}.`, met: true };
  }
  if (live.resultingMin <= targetAmount) {
    return {
      text: `The lower end of this range meets ${formatINR(targetAmount)}; the upper end is ${formatINR(live.resultingMax - targetAmount)} above it.`,
      met: false,
    };
  }
  return {
    text: `Still ${formatINR(live.resultingMin - targetAmount)} above your target. Turn on more changes, or set a target this construction can reach.`,
    met: false,
  };
}

export function PlanCard({
  plan,
  run,
  index,
  live,
  selectedIds,
  isUpdating,
  isApplying,
  canApply,
  onToggle,
  onApply,
}: {
  plan: BudgetPlan;
  run: BudgetRun;
  index: number;
  live: BudgetLiveTotals;
  selectedIds: string[];
  isUpdating: boolean;
  isApplying: boolean;
  canApply: boolean;
  onToggle: (substitutionId: string) => void;
  onApply: () => void;
}) {
  const letter = OPTION_LETTERS[index] ?? String(index + 1);
  const verdict = targetVerdict(live, run.targetAmount);
  const activeCount = plan.substitutions.filter(
    (s) => !s.isOptional || selectedIds.includes(s.id),
  ).length;

  return (
    <article className="bo-plan" data-testid={`card-budget-plan-${plan.id}`}>
      <header className="bo-plan-head">
        <div className="bo-plan-title">
          <div className="eyebrow">Option {letter}</div>
          <h3>{plan.label}</h3>
        </div>
        {isUpdating ? (
          <span className="bo-plan-working" role="status">
            <Loader2 size={13} className="spin" aria-hidden="true" /> Repricing
          </span>
        ) : null}
      </header>

      <div className="bo-figures">
        <div>
          <strong data-testid={`text-similarity-${plan.id}`}>{live.similarityPercent}%</strong>
          <span>Visual similarity</span>
        </div>
        <div>
          <strong data-testid={`text-savings-${plan.id}`}>Save {formatINR(live.savings)}</strong>
          <span>Against the current estimate</span>
        </div>
        <div>
          <strong data-testid={`text-resulting-${plan.id}`}>
            {formatRange(live.resultingMin, live.resultingMax)}
          </strong>
          <span>Resulting estimate</span>
        </div>
      </div>

      <div className="bo-similarity-bar" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, live.similarityPercent))}%` }} />
      </div>

      {plan.rationale ? <p className="bo-rationale">{plan.rationale}</p> : null}

      <div className="eyebrow bo-changes-label">
        {activeCount} of {plan.substitutions.length} changes on
      </div>

      <div className="bo-substitutions">
        {plan.substitutions.map((sub) => (
          <SubstitutionRow
            key={sub.id}
            substitution={sub}
            selected={!sub.isOptional || selectedIds.includes(sub.id)}
            disabled={isApplying}
            planLabel={plan.label}
            onToggle={() => onToggle(sub.id)}
          />
        ))}
      </div>

      <footer className="bo-plan-foot">
        <p className={`bo-verdict ${verdict.met ? 'met' : ''}`} data-testid={`text-verdict-${plan.id}`}>
          {verdict.met ? <Check size={13} aria-hidden="true" /> : null}
          {verdict.text}
        </p>
        <BudgetButton
          variant={index === 0 ? 'coral' : 'primary'}
          onClick={onApply}
          disabled={!canApply || isApplying || activeCount === 0}
          testId={`button-apply-plan-${plan.id}`}
        >
          {isApplying ? 'Creating the version…' : 'Apply as a new version'}
        </BudgetButton>
      </footer>
    </article>
  );
}

export default PlanCard;
