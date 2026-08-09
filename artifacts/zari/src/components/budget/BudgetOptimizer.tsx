import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { PlanCard } from './PlanCard';
import { InfeasibleNotice } from './InfeasibleNotice';
import { BudgetButton, BudgetToast, DemoNote, demoOnlyMessage, messageFor, type ToastState } from './BudgetChrome';
import { useApplyPlan, useBudgetRuns, useOptimizeBudget, useToggleSubstitutions } from '@/hooks/useBudget';
import {
  computeLive,
  defaultSelection,
  paiseToRupeeInput,
  rupeeInputToPaise,
  type ApplyResult,
  type BudgetLiveTotals,
  type BudgetPlan,
  type BudgetRun,
} from '@/services/budget';
import { isApiConfigured } from '@/lib/config';
import { formatINR, formatRange } from '@/types';
import '@/styles/budget.css';

/**
 * The budget optimizer.
 *
 * PRODUCT RULE: this is never a slider. A slider hides what it takes away. Here
 * every plan is a named list of concrete substitutions, each with the exact
 * from/to values, what it saves, and one plain sentence about what the customer
 * will actually see — and each one is theirs to switch off.
 *
 * Three further rules are load-bearing in here:
 *  - The maths behind a toggle is the SERVER's. The local mirror only keeps the
 *    figures responsive while the PATCH is in flight, and is the honest answer
 *    on the demo set. A server number always replaces it.
 *  - Applying is explicit. It creates a new design version and it only ever
 *    happens because someone pressed the button on a specific plan.
 *  - "Not reachable" is an outcome, not an error. It gets a real state with the
 *    binding constraint named and alternatives offered — never a toast.
 *
 * Money is paise throughout, including `targetAmount`. The field takes rupees
 * because that is what a customer types; it is multiplied by 100 on the way in
 * and only ever displayed through `formatINR` / `formatRange`.
 */

export interface BudgetOptimizerProps {
  designId: string;
  /** Optimize against a specific version. Defaults to the design's current one. */
  versionId?: string;
  /** Called after a plan has been applied and a new version exists. */
  onApplied?: (result: ApplyResult) => void;
}

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

export function BudgetOptimizer({ designId, versionId, onApplied }: BudgetOptimizerProps) {
  const { data: runs, isLive, isLoading } = useBudgetRuns(designId);
  const optimize = useOptimizeBudget(designId);
  const toggle = useToggleSubstitutions(designId);
  const apply = useApplyPlan(designId);

  const [freshRun, setFreshRun] = useState<BudgetRun | null>(null);
  const [pickedRunId, setPickedRunId] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [toast, setToast] = useState<ToastState>(null);

  // Which substitutions are on, per plan, and what that currently costs.
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [live, setLive] = useState<Record<string, BudgetLiveTotals>>({});
  // Toggles can be quicker than the network. The ref is the truth a late
  // response is checked against, so a stale reply never rewrites the screen.
  const selectionRef = useRef<Record<string, string[]>>({});

  const allRuns = useMemo(
    () => (freshRun ? [freshRun, ...runs.filter((r) => r.id !== freshRun.id)] : runs),
    [freshRun, runs],
  );

  const run = useMemo(
    () => allRuns.find((r) => r.id === pickedRunId) ?? allRuns[0] ?? null,
    [allRuns, pickedRunId],
  );

  /** True when the run on screen came from the server for THIS design. */
  const runIsLive = Boolean(run && (isLive || (freshRun && run.id === freshRun.id)));

  // Reset the toggles whenever a DIFFERENT run is shown, so a plan always
  // starts from the selection the optimizer proposed. Keyed on the run id
  // rather than the object: a background refetch hands back an equal run with a
  // new identity, and that must not wipe a target the customer is mid-way
  // through typing.
  useEffect(() => {
    if (!run) return;
    const nextSelection: Record<string, string[]> = {};
    const nextLive: Record<string, BudgetLiveTotals> = {};
    for (const plan of run.plans) {
      const ids = defaultSelection(plan);
      nextSelection[plan.id] = ids;
      nextLive[plan.id] = computeLive(run, plan, ids);
    }
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setLive(nextLive);
    setTarget(run.targetAmount ? paiseToRupeeInput(run.targetAmount) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id]);

  const busy = toggle.isPending || apply.isPending;

  const submit = () => {
    const targetAmount = rupeeInputToPaise(target);
    if (targetAmount === null) {
      setToast({ message: 'Enter a target in rupees — 5,000, for example.' });
      return;
    }
    if (!isApiConfigured) {
      setToast({ message: demoOnlyMessage });
      return;
    }
    optimize.mutate(
      { targetAmount, ...(versionId ? { versionId } : {}) },
      {
        onSuccess: (result) => {
          setFreshRun(result);
          setPickedRunId(result.id);
          // The infeasible case gets a full state below; the toast only points
          // at it rather than trying to be the explanation.
          if (result.status === 'INFEASIBLE') {
            setToast({ message: `${formatINR(targetAmount)} is out of reach here. The reason is below.` });
          } else {
            const count = result.plans.length;
            setToast({
              message: count
                ? `${count} way${count === 1 ? '' : 's'} to reach ${formatINR(targetAmount)}. Every change is yours to keep or drop.`
                : 'Zari found nothing worth changing at that target.',
            });
          }
        },
        onError: (error) =>
          setToast({
            message: messageFor(
              error,
              "Zari couldn't work out a budget plan just now. Nothing is lost — try again.",
            ),
          }),
      },
    );
  };

  const onToggle = (plan: BudgetPlan, substitutionId: string) => {
    if (!run) return;
    const sub = plan.substitutions.find((s) => s.id === substitutionId);
    // Structural changes stay on. The row says why rather than going quiet.
    if (!sub || !sub.isOptional) return;

    const current = selectionRef.current[plan.id] ?? defaultSelection(plan);
    const next = current.includes(substitutionId)
      ? current.filter((id) => id !== substitutionId)
      : [...current, substitutionId];

    selectionRef.current = { ...selectionRef.current, [plan.id]: next };
    setSelection(selectionRef.current);
    setLive((current2) => ({ ...current2, [plan.id]: computeLive(run, plan, next) }));

    if (!isApiConfigured || !runIsLive) return;

    toggle.mutate(
      { planId: plan.id, substitutionIds: next },
      {
        onSuccess: (result) => {
          const onScreen = selectionRef.current[plan.id] ?? [];
          const returned = result.plan.substitutions.filter((s) => s.isSelected).map((s) => s.id);
          // A reply for a selection the customer has already moved past is
          // dropped: the price on screen must match the switches on screen.
          if (!sameSet(onScreen, returned)) return;
          setLive((current2) => ({ ...current2, [plan.id]: result.live }));
        },
        onError: (error) =>
          setToast({
            message: messageFor(
              error,
              "Zari couldn't reprice that change. Nothing is lost — try the switch again.",
            ),
          }),
      },
    );
  };

  const onApply = (plan: BudgetPlan) => {
    if (!isApiConfigured || !runIsLive) {
      setToast({ message: demoOnlyMessage });
      return;
    }
    apply.mutate(plan.id, {
      onSuccess: (result) => {
        setToast({
          message: `New version created — ${formatINR(result.savings)} off, ${result.appliedSubstitutions} change${result.appliedSubstitutions === 1 ? '' : 's'} applied. Your earlier version is still here.`,
        });
        onApplied?.(result);
      },
      onError: (error) =>
        setToast({
          message: messageFor(
            error,
            "Zari couldn't apply that plan. Nothing is lost — your design is unchanged.",
          ),
        }),
    });
  };

  const targetPaise = rupeeInputToPaise(target);
  const aboveEstimate = run && targetPaise !== null && targetPaise >= run.currentMax;
  const plans = run ? run.plans.slice(0, 3) : [];

  return (
    <section className="budget-optimizer" data-testid="card-budget-optimizer">
      <header className="bo-header">
        <div className="eyebrow">
          Budget optimizer · always free <DemoNote isLive={runIsLive} />
        </div>
        <h1>Make this design fit your budget.</h1>
        <p>
          Not a slider that quietly makes things worse. Every change is named, priced, and explained
          — and every one of them is yours to keep or drop.
        </p>
      </header>

      <form
        className="bo-targets"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="bo-figure">
          <span className="eyebrow">Current estimate</span>
          <strong data-testid="text-current-estimate">
            {run ? formatRange(run.currentMin, run.currentMax) : 'Not priced yet'}
          </strong>
        </div>

        <span className="bo-arrow" aria-hidden="true">
          →
        </span>

        <div className="bo-target-field">
          <label className="eyebrow" htmlFor="budget-target-input">
            Your target
          </label>
          <div className="bo-input">
            <span aria-hidden="true">₹</span>
            <input
              id="budget-target-input"
              inputMode="numeric"
              autoComplete="off"
              placeholder="5,000"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              aria-label="Target budget in rupees"
              data-testid="input-budget-target"
            />
          </div>
        </div>

        <BudgetButton
          type="submit"
          variant="coral"
          disabled={optimize.isPending}
          testId="button-optimize-budget"
        >
          {optimize.isPending ? (
            <>
              <Loader2 size={14} className="spin" /> Finding what can move…
            </>
          ) : (
            <>
              Show me the options <ArrowRight size={15} />
            </>
          )}
        </BudgetButton>
      </form>

      {aboveEstimate ? (
        <p className="bo-hint" data-testid="text-target-hint">
          That target is already at or above the current estimate, so there may be nothing worth
          trading away.
        </p>
      ) : null}

      {allRuns.length > 1 ? (
        <div className="bo-history">
          <span className="eyebrow">Earlier passes</span>
          {allRuns.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`bo-history-chip ${run && item.id === run.id ? 'active' : ''}`}
              onClick={() => setPickedRunId(item.id)}
              data-testid={`button-budget-run-${item.id}`}
            >
              {formatINR(item.targetAmount)}
              {item.status === 'INFEASIBLE' ? ' · not reachable' : ''}
            </button>
          ))}
        </div>
      ) : null}

      {isLoading || optimize.isPending ? (
        <div className="bo-working" role="status" aria-live="polite">
          <Sparkles size={16} aria-hidden="true" />
          <span>
            Zari is checking which materials and finishes can move without losing the design.
          </span>
        </div>
      ) : null}

      {!run ? (
        <div className="bo-empty" data-testid="card-budget-empty">
          <h3>Set a target and see what can move.</h3>
          <p>
            Zari will come back with up to three ways there, each one a list of real changes rather
            than a number that quietly went down.
          </p>
        </div>
      ) : run.status === 'FAILED' ? (
        <div className="bo-empty" data-testid="card-budget-failed">
          <h3>Zari couldn’t finish that budget pass.</h3>
          <p>Nothing is lost and your design is unchanged. Set the target again to retry.</p>
        </div>
      ) : (
        <>
          {run.status === 'INFEASIBLE' ? (
            <InfeasibleNotice run={run} onTryTarget={setTarget} />
          ) : null}

          {plans.length ? (
            <>
              {run.status === 'INFEASIBLE' ? (
                <div className="eyebrow bo-closest-label">How close this construction gets</div>
              ) : null}
              <div className="bo-plans" data-testid="card-budget-plans">
                {plans.map((plan, index) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    run={run}
                    index={index}
                    live={live[plan.id] ?? computeLive(run, plan, selection[plan.id] ?? defaultSelection(plan))}
                    selectedIds={selection[plan.id] ?? defaultSelection(plan)}
                    isUpdating={toggle.isPending && toggle.variables?.planId === plan.id}
                    isApplying={apply.isPending && apply.variables === plan.id}
                    canApply={!busy}
                    onToggle={(substitutionId) => onToggle(plan, substitutionId)}
                    onApply={() => onApply(plan)}
                  />
                ))}
              </div>
            </>
          ) : run.status === 'READY' ? (
            <div className="bo-empty" data-testid="card-budget-no-plans">
              <h3>There is nothing here worth trading away.</h3>
              <p>
                At {formatINR(run.targetAmount)} the design already fits, or the only changes left
                would alter the garment rather than its materials.
              </p>
            </div>
          ) : null}
        </>
      )}

      <p className="bo-footnote">
        Zari never changes your design on its own. Applying a plan creates a new version — the one
        you have now stays exactly as it is, and you can go back to it at any point. The resulting
        figure is an estimate; your designer confirms a final quote after measurements.
      </p>

      <BudgetToast toast={toast} setToast={setToast} />
    </section>
  );
}

export default BudgetOptimizer;
