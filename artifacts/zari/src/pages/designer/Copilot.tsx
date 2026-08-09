import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { Button, DemoNote, DesignerShell, Toast, type ToastState } from './_shared';
import { useDesignerCopilot } from '@/hooks/useDesigner';

/**
 * Zari Copilot.
 *
 * Assistive, never in the way of the actual work: a headline and a short list
 * of things worth doing, each with the reason it matters. It suggests; the
 * designer decides. Nothing here moves money or changes an order on its own.
 */
export default function DesignerCopilot() {
  const { data, isLive } = useDesignerCopilot();
  const [done, setDone] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastState>(null);

  const settle = (title: string, action: string) => {
    setDone((current) => (current.includes(title) ? current : [...current, title]));
    setToast({ message: `${action} noted. Copilot will stop reminding you about this one.` });
  };

  return (
    <DesignerShell breadcrumb="Copilot">
      <div className="app-heading">
        <div>
          <div className="eyebrow">
            Designer space / copilot <DemoNote isLive={isLive} />
          </div>
          <h1>{data.headline}</h1>
          <p>
            Copilot reads your orders, quotes and messages. It suggests — you decide what actually
            happens.
          </p>
        </div>
        <Link href="/designer" className="button button-ghost" data-testid="link-copilot-dashboard">
          Back to dashboard <ArrowRight size={14} />
        </Link>
      </div>

      {data.tasks.length ? (
        <div className="orders-list">
          {data.tasks.map((task, index) => {
            const settled = done.includes(task.title);
            return (
              <div
                className="surface order-row"
                key={`${task.title}-${index}`}
                data-testid={`card-copilot-task-${index}`}
              >
                <div style={{ textAlign: 'center' }}>
                  <span
                    className="avatar"
                    style={settled ? { background: 'hsl(var(--secondary))' } : undefined}
                  >
                    {settled ? <Check size={15} /> : String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <div>
                  <strong style={settled ? { opacity: 0.55 } : undefined}>{task.title}</strong>
                  <p>{task.detail}</p>
                </div>
                <div style={{ display: 'grid', justifyItems: 'end', gap: 8 }}>
                  {settled ? (
                    <span className="status-pill">DONE</span>
                  ) : (
                    <Button
                      variant="soft"
                      onClick={() => settle(task.title, task.action)}
                      testId={`button-copilot-action-${index}`}
                    >
                      {task.action}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <Sparkles size={23} />
          <h3>Nothing needs you right now.</h3>
          <p>When an order slips, a quote goes quiet, or a customer writes, it will appear here.</p>
          <Link href="/designer/bids" className="button button-primary" data-testid="link-empty-copilot-quotes">
            Look at open requests
          </Link>
        </div>
      )}

      <div className="surface studio-card" style={{ marginTop: 22, maxWidth: 820 }}>
        <div className="eyebrow">How Copilot decides</div>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.55, margin: '12px 0 0' }}>
          Copilot only reads what is already in your studio — promised dates, open quotes, unread
          messages, and quality-control results. It never changes an order, never replies for you,
          and never touches a payment.
          {data.source === 'rules'
            ? ' Today it is running on Zari’s own rules rather than the written digest.'
            : ''}
        </p>
      </div>

      <Toast toast={toast} setToast={setToast} />
    </DesignerShell>
  );
}
