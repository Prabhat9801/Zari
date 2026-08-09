import { ArrowRight } from 'lucide-react';
import { BudgetButton } from './BudgetChrome';
import type { BudgetRun } from '@/services/budget';
import { formatINR, formatRange } from '@/types';

/**
 * The target cannot be reached.
 *
 * This is a first-class outcome, not an error. It says the number, names the
 * binding constraint the AI service identified, and offers the alternatives it
 * returned — a customer who is told no should leave knowing exactly why and
 * what to try instead. There is no status code and no apology on this screen.
 */

const FALLBACK_REASON =
  'One component of this design costs more than the whole target on its own, so no combination of substitutions can reach it without changing the construction.';

export function InfeasibleNotice({
  run,
  onTryTarget,
}: {
  run: BudgetRun;
  /** Puts a suggested figure in the target field. Never optimizes on its own. */
  onTryTarget?: (rupees: string) => void;
}) {
  // A realistic floor to offer, when the plans show one. The closest plan's
  // lower bound is the honest "this is as far as it goes" number.
  const floor = run.plans.length
    ? Math.min(...run.plans.map((plan) => plan.resultingMin))
    : null;

  return (
    <section className="bo-infeasible" data-testid="card-budget-infeasible">
      <div className="eyebrow">Not reachable · and here is exactly why</div>
      <h3 data-testid="text-infeasible-headline">
        {formatINR(run.targetAmount)} isn’t achievable with this exact construction.
      </h3>

      <p className="bo-constraint" data-testid="text-binding-constraint">
        {run.infeasibleReason ?? FALLBACK_REASON}
      </p>

      <div className="bo-infeasible-figures">
        <div>
          <span className="eyebrow">Current estimate</span>
          <strong>{formatRange(run.currentMin, run.currentMax)}</strong>
        </div>
        <div>
          <span className="eyebrow">You asked for</span>
          <strong>{formatINR(run.targetAmount)}</strong>
        </div>
        {floor !== null ? (
          <div>
            <span className="eyebrow">Realistic floor</span>
            <strong data-testid="text-realistic-floor">{formatINR(floor)}</strong>
          </div>
        ) : null}
      </div>

      {run.alternatives.length ? (
        <>
          <div className="eyebrow bo-alternatives-label">What works instead</div>
          <ul className="bo-alternatives">
            {run.alternatives.map((alternative, index) => (
              <li key={alternative} data-testid={`card-alternative-${index}`}>
                <ArrowRight size={13} aria-hidden="true" />
                <span>{alternative}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="bo-constraint">
          Ask Zari for a simpler construction in the studio, or set a higher target and run this
          again — the design itself is untouched either way.
        </p>
      )}

      {floor !== null && onTryTarget ? (
        <BudgetButton
          variant="soft"
          onClick={() => onTryTarget(String(Math.ceil(floor / 100)))}
          testId="button-try-floor-target"
        >
          Try {formatINR(floor)} instead <ArrowRight size={14} />
        </BudgetButton>
      ) : null}

      <p className="bo-untouched">Nothing has changed. Your design is exactly as you left it.</p>
    </section>
  );
}

export default InfeasibleNotice;
