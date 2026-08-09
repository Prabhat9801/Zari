import { useState } from 'react';
import { Loader2, Pencil, Plus, Save, Trash2, WalletCards } from 'lucide-react';
import { useCostRules, useRetireCostRule, useSaveCostRule } from '@/hooks/useOps';
import {
  COST_COMPONENTS,
  COST_COMPONENT_LABELS,
  paiseToRupeeInput,
  rupeesToPaise,
  type CostComponent,
  type CostRuleView,
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
 * The cost rules table.
 *
 * This is the ground truth the AI is priced against — the design service is
 * told these are the only rates it may use, so a row changed here changes every
 * estimate made afterwards. The screen says so, repeatedly, on purpose.
 */

interface FormState {
  component: CostComponent;
  key: string;
  label: string;
  minRupees: string;
  maxRupees: string;
  unit: string;
  region: string;
  multiplier: string;
  notes: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  component: 'FABRIC',
  key: '',
  label: '',
  minRupees: '',
  maxRupees: '',
  unit: 'm',
  region: '',
  multiplier: '1',
  notes: '',
  isActive: true,
};

const formFor = (rule: CostRuleView): FormState => ({
  component: rule.component,
  key: rule.key,
  label: rule.label,
  minRupees: paiseToRupeeInput(rule.minRate),
  maxRupees: paiseToRupeeInput(rule.maxRate),
  unit: rule.unit,
  region: rule.region ?? '',
  multiplier: String(rule.multiplier),
  notes: rule.notes,
  isActive: rule.isActive,
});

export default function OpsCostRulesPage() {
  const { data: rules, isLive, isLoading } = useCostRules();
  const saveRule = useSaveCostRule();
  const retireRule = useRetireCostRule();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const active = rules.filter((r) => r.isActive);
  const retired = rules.filter((r) => !r.isActive);

  const grouped = COST_COMPONENTS.map((component) => ({
    component,
    rows: active.filter((r) => r.component === component),
  })).filter((group) => group.rows.length > 0);

  const edit = (rule: CostRuleView) => {
    setForm(formFor(rule));
    setEditingId(rule.id);
    setToast({
      message: `Editing ${rule.label}. Saving replaces the rate every future estimate uses.`,
    });
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const save = () => {
    if (!isLive) {
      setToast({ message: liveOnlyMessage });
      return;
    }
    const key = form.key.trim();
    const label = form.label.trim();
    if (!key || !label) {
      setToast({ message: 'A rule needs both a key and a name people can read.' });
      return;
    }

    const minRate = rupeesToPaise(form.minRupees);
    const maxRate = rupeesToPaise(form.maxRupees);
    if (minRate === null || maxRate === null) {
      setToast({ message: 'Both rates are amounts in rupees, like 620 or 780.' });
      return;
    }
    if (minRate > maxRate) {
      setToast({ message: 'The low rate cannot be above the high rate.' });
      return;
    }

    const multiplier = Number(form.multiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 10) {
      setToast({ message: 'The multiplier is a number between 0 and 10.' });
      return;
    }

    saveRule.mutate(
      {
        component: form.component,
        key,
        label,
        minRate,
        maxRate,
        unit: form.unit.trim() || 'm',
        region: form.region.trim() || null,
        multiplier,
        isActive: form.isActive,
        notes: form.notes.trim() || null,
      },
      {
        onSuccess: (saved) => {
          reset();
          setToast({
            message: `${saved.label} is now ${saved.rangeLabel}. Every estimate from here on uses it.`,
          });
        },
        onError: (error) =>
          setToast({
            message: messageFor(error, "Zari couldn't save that rate. Nothing is lost — try again."),
          }),
      },
    );
  };

  const retire = (rule: CostRuleView) => {
    if (!isLive) {
      setToast({ message: liveOnlyMessage });
      return;
    }
    if (retiring !== rule.id) {
      setRetiring(rule.id);
      return;
    }
    retireRule.mutate(rule.id, {
      onSuccess: () => {
        setRetiring(null);
        setToast({
          message: `${rule.label} is retired. It stays on record but no longer prices anything.`,
        });
      },
      onError: (error) => {
        setRetiring(null);
        setToast({ message: messageFor(error, "Zari couldn't retire that rate. Try again.") });
      },
    });
  };

  return (
    <OpsShell section="COST RULES">
      <div className="app-heading">
        <div>
          <div className="eyebrow">
            Cost rules{isLoading ? ' · loading' : ''} <DemoNote isLive={isLive} />
          </div>
          <h1>The rates every estimate is built from.</h1>
          <p>
            The design service is given this table and told these are the only rates it may use. It
            never invents a price. Change a row here and every estimate made afterwards changes with
            it.
          </p>
        </div>
      </div>

      <div className="guest-banner">
        <WalletCards size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Estimates already shown to a customer keep the numbers they were quoted. Editing a rate
        moves the ground under the next estimate, not the last one.
      </div>

      <div className="builder-layout">
        <section className="builder-form">
          {grouped.map((group) => (
            <div
              className="surface builder-section"
              key={group.component}
              data-testid={`card-cost-group-${group.component}`}
            >
              <div className="builder-section-heading">
                <div>
                  <div className="eyebrow">{group.component}</div>
                  <h2>{COST_COMPONENT_LABELS[group.component]}</h2>
                </div>
                <span className="completion">{group.rows.length} in use</span>
              </div>

              {group.rows.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    borderTop: '1px solid hsl(var(--border))',
                    paddingTop: 14,
                    marginTop: 14,
                  }}
                  data-testid={`card-cost-rule-${rule.id}`}
                >
                  <div className="cost-row" style={{ padding: 0 }}>
                    <strong style={{ fontSize: 13 }}>{rule.label}</strong>
                    <span className="mono">{rule.rangeLabel}</span>
                  </div>
                  <div className="cost-row" style={{ padding: '6px 0 0' }}>
                    <span className="muted mono" style={{ fontSize: 11 }}>
                      {rule.key}
                    </span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {rule.scopeLabel}
                      {rule.multiplier === 1 ? '' : ` · ×${rule.multiplier}`}
                    </span>
                  </div>
                  {rule.notes ? (
                    <p className="muted" style={{ fontSize: 11, lineHeight: 1.5, margin: '8px 0 0' }}>
                      {rule.notes}
                    </p>
                  ) : null}

                  {retiring === rule.id ? (
                    <div
                      className="guest-banner"
                      style={{ marginTop: 12, marginBottom: 0 }}
                      data-testid={`card-cost-retire-confirm-${rule.id}`}
                    >
                      Retire {rule.label}? Estimates stop using it immediately. The row is kept on
                      record, not deleted.
                    </div>
                  ) : null}

                  <div className="action-row" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button
                      className="icon-button"
                      aria-label={`Edit ${rule.label}`}
                      onClick={() => edit(rule)}
                      data-testid={`button-edit-cost-rule-${rule.id}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Retire ${rule.label}`}
                      onClick={() => retire(rule)}
                      style={
                        retiring === rule.id
                          ? {
                              background: 'hsl(var(--destructive))',
                              color: 'hsl(var(--destructive-foreground))',
                              borderColor: 'hsl(var(--destructive))',
                            }
                          : undefined
                      }
                      data-testid={`button-retire-cost-rule-${rule.id}`}
                    >
                      <Trash2 size={14} />
                    </button>
                    {retiring === rule.id ? (
                      <button
                        className="text-link"
                        onClick={() => setRetiring(null)}
                        data-testid={`button-cancel-retire-${rule.id}`}
                      >
                        Keep it
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {retired.length ? (
            <div className="surface builder-section" data-testid="card-cost-retired">
              <div className="builder-section-heading">
                <div>
                  <div className="eyebrow">Withdrawn</div>
                  <h2>Retired rates.</h2>
                </div>
                <span className="completion">{retired.length} on record</span>
              </div>
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 0 }}>
                Kept so an old estimate can still be explained. Saving a rule with the same
                component, key and region brings it back into use.
              </p>
              {retired.map((rule) => (
                <div className="cost-row" key={rule.id} data-testid={`card-retired-rule-${rule.id}`}>
                  <span>
                    {rule.label} <Pill tone="quiet">RETIRED</Pill>
                  </span>
                  <span className="mono">{rule.rangeLabel}</span>
                </div>
              ))}
            </div>
          ) : null}

          {rules.length === 0 ? (
            <div className="empty-state" data-testid="card-cost-rules-empty">
              <WalletCards size={23} />
              <h3>There are no rates yet.</h3>
              <p>Until this table has rows, Zari cannot put a price on anything.</p>
            </div>
          ) : null}
        </section>

        <aside style={{ display: 'grid', gap: 15, alignContent: 'start' }}>
          <div className="surface builder-section" data-testid="card-cost-rule-form">
            <div className="builder-section-heading">
              <div>
                <div className="eyebrow">{editingId ? 'Editing a rate' : 'Add or update a rate'}</div>
                <h2>{editingId ? 'Change what this costs.' : 'A new rate.'}</h2>
              </div>
            </div>

            <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: -8 }}>
              Saving a component, key and region that already exist updates that row rather than
              adding a second one.
            </p>

            <div className="form-field">
              <label htmlFor="cost-component">Component</label>
              <select
                id="cost-component"
                value={form.component}
                onChange={(event) => set('component', event.target.value as CostComponent)}
                data-testid="select-cost-component"
              >
                {COST_COMPONENTS.map((component) => (
                  <option key={component} value={component}>
                    {COST_COMPONENT_LABELS[component]}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="cost-key">
                Key <span>Lowercase, hyphenated — chanderi-silk</span>
              </label>
              <input
                id="cost-key"
                value={form.key}
                onChange={(event) => set('key', event.target.value)}
                placeholder="chanderi-silk"
                data-testid="input-cost-key"
              />
            </div>

            <div className="form-field">
              <label htmlFor="cost-label">
                Name <span>What a customer sees on the estimate</span>
              </label>
              <input
                id="cost-label"
                value={form.label}
                onChange={(event) => set('label', event.target.value)}
                placeholder="Chanderi silk"
                data-testid="input-cost-label"
              />
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="cost-min">Low rate in rupees</label>
                <input
                  id="cost-min"
                  value={form.minRupees}
                  onChange={(event) => set('minRupees', event.target.value)}
                  inputMode="decimal"
                  placeholder="620"
                  data-testid="input-cost-min-rate"
                />
              </div>
              <div className="form-field">
                <label htmlFor="cost-max">High rate in rupees</label>
                <input
                  id="cost-max"
                  value={form.maxRupees}
                  onChange={(event) => set('maxRupees', event.target.value)}
                  inputMode="decimal"
                  placeholder="780"
                  data-testid="input-cost-max-rate"
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="cost-unit">
                  Per <span>m, piece, panel</span>
                </label>
                <input
                  id="cost-unit"
                  value={form.unit}
                  onChange={(event) => set('unit', event.target.value)}
                  data-testid="input-cost-unit"
                />
              </div>
              <div className="form-field">
                <label htmlFor="cost-multiplier">Multiplier</label>
                <input
                  id="cost-multiplier"
                  value={form.multiplier}
                  onChange={(event) => set('multiplier', event.target.value)}
                  inputMode="decimal"
                  data-testid="input-cost-multiplier"
                />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="cost-region">
                Region <span>Leave empty to apply everywhere</span>
              </label>
              <input
                id="cost-region"
                value={form.region}
                onChange={(event) => set('region', event.target.value)}
                placeholder="Jaipur"
                data-testid="input-cost-region"
              />
            </div>

            <div className="form-field">
              <label htmlFor="cost-notes">
                Note <span>Why this rate is what it is</span>
              </label>
              <textarea
                id="cost-notes"
                value={form.notes}
                onChange={(event) => set('notes', event.target.value)}
                placeholder="Handloom, 44 inch width."
                data-testid="input-cost-notes"
              />
            </div>

            <div className="builder-check">
              <input
                type="checkbox"
                className="toggle"
                checked={form.isActive}
                onChange={(event) => set('isActive', event.target.checked)}
                aria-label="Use this rate in estimates"
                data-testid="toggle-cost-active"
              />
              <div>
                <strong>Price estimates with this rate</strong>
                <span>
                  Off means the row is kept on record but the design service never sees it.
                </span>
              </div>
            </div>

            <div className="studio-actions" style={{ marginTop: 18 }}>
              {editingId ? (
                <OpsButton variant="ghost" onClick={reset} testId="button-cancel-cost-edit">
                  Cancel
                </OpsButton>
              ) : null}
              <OpsButton
                variant="coral"
                onClick={save}
                disabled={saveRule.isPending}
                testId="button-save-cost-rule"
              >
                {saveRule.isPending ? (
                  <>
                    <Loader2 size={14} className="spin" /> Saving…
                  </>
                ) : editingId ? (
                  <>
                    <Save size={14} /> Save the new rate
                  </>
                ) : (
                  <>
                    <Plus size={14} /> Add the rate
                  </>
                )}
              </OpsButton>
            </div>
          </div>

          <div className="surface studio-card">
            <h3>Why this table matters</h3>
            <div className="score-breakdown">
              <span>Rates in use</span>
              <strong>{active.length}</strong>
            </div>
            <div className="score-breakdown">
              <span>Retired</span>
              <strong>{retired.length}</strong>
            </div>
            <p className="muted" style={{ fontSize: 11, lineHeight: 1.55, marginBottom: 0 }}>
              Zari tells customers that no rupee on an estimate is invented. This table is what makes
              that true, so keep the names readable and the notes honest.
            </p>
          </div>
        </aside>
      </div>

      <OpsToast toast={toast} setToast={setToast} />
    </OpsShell>
  );
}
