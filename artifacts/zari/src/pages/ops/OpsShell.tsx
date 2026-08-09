import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowUpRight, LayoutGrid, MessageCircle, ShieldCheck, UsersRound, WalletCards } from 'lucide-react';
import { isApiConfigured } from '@/lib/config';
import { ApiError } from '@/lib/apiClient';

/**
 * The frame and the small shared parts of the ops console.
 *
 * Deliberately its own shell rather than the customer AppShell: ops is internal
 * tooling with a different navigation, and it should never look like a place a
 * customer wandered into. Everything here is composed from the existing design
 * system classes — no new stylesheet.
 */

export type ToastState = { message: string } | null;

const OPS_NAV = [
  { href: '/ops', label: 'Overview', icon: LayoutGrid },
  { href: '/ops/qc', label: 'Quality control', icon: ShieldCheck },
  { href: '/ops/designers', label: 'Verifications', icon: UsersRound },
  { href: '/ops/disputes', label: 'Disputes', icon: MessageCircle },
  { href: '/ops/cost-rules', label: 'Cost rules', icon: WalletCards },
] as const;

/**
 * Shown when a screen is rendering the bundled demo set rather than live data.
 * Passing demo content off as real would break the one promise the product is
 * built on, so this is deliberately visible — just quiet.
 */
export function DemoNote({ isLive }: { isLive: boolean }) {
  if (isLive || !isApiConfigured) return null;
  return (
    <span
      className="demo-note"
      title="The server is unreachable or this account is not an ops account, so Zari is showing sample content."
      data-testid="status-demo-data"
    >
      Sample data
    </span>
  );
}

export function OpsButton({
  children,
  variant = 'primary',
  className = '',
  onClick,
  type = 'button',
  testId,
  disabled = false,
}: {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'soft' | 'coral';
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`button button-${variant} ${className}`}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

export type PillTone = 'neutral' | 'positive' | 'warning' | 'critical' | 'quiet';

const PILL_TONES: Record<PillTone, { background: string; color: string }> = {
  neutral: { background: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' },
  positive: { background: 'hsl(var(--primary) / .14)', color: 'hsl(var(--primary))' },
  warning: { background: 'hsl(16 52% 62% / .18)', color: 'hsl(10 40% 35%)' },
  critical: { background: 'hsl(var(--destructive) / .14)', color: 'hsl(4 62% 36%)' },
  quiet: { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
};

/** Status in form as well as in words — these screens are read at a glance. */
export function Pill({
  children,
  tone = 'neutral',
  testId,
}: {
  children: ReactNode;
  tone?: PillTone;
  testId?: string;
}) {
  return (
    <span className="status-pill" style={PILL_TONES[tone]} data-testid={testId}>
      {children}
    </span>
  );
}

export function OpsToast({
  toast,
  setToast,
}: {
  toast: ToastState;
  setToast: (toast: ToastState) => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast, setToast]);

  return toast ? (
    <div className="toast-note" role="status" data-testid="status-ops-toast">
      {toast.message}
    </div>
  ) : null;
}

/** Errors are human-readable here too. Never a status code, never a stack. */
export const messageFor = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

/**
 * The guard every write on these screens runs first. Ops actions move money and
 * change a studio's standing, so they are never simulated against demo data.
 */
export const liveOnlyMessage =
  'This screen is showing sample data, so nothing can be changed from here. Sign in to an ops account with the API reachable.';

export function OpsShell({ section, children }: { section: string; children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/ops" className="brand" data-testid="link-ops-brand">
          <span className="brand-mark">
            <span>Z</span>
          </span>
          <span>Zari ops</span>
        </Link>
        <div className="nav-label eyebrow">Operations</div>
        <nav className="side-nav">
          {OPS_NAV.map(({ href, label, icon: Icon }) => (
            <Link
              href={href}
              key={href}
              className={`side-link ${location === href || (href !== '/ops' && location.startsWith(href)) ? 'active' : ''}`}
              data-testid={`link-ops-nav-${href.split('/').pop()}`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="side-bottom">
          <Link href="/app" className="side-link" data-testid="link-ops-exit">
            <ArrowUpRight size={16} />
            Back to the workspace
          </Link>
          <div className="profile-mini">
            <span className="avatar">OP</span>
            <span>Zari operations</span>
          </div>
        </div>
      </aside>

      <div className="mobile-header">
        <Link href="/ops" className="brand" data-testid="link-ops-mobile-brand">
          <span className="brand-mark">
            <span>Z</span>
          </span>
          <span>Zari ops</span>
        </Link>
      </div>

      <main className="app-main">
        <div className="app-topbar">
          <div className="breadcrumbs">
            <span>ZARI OPS</span>
            <span>/</span>
            <span>{section}</span>
          </div>
        </div>
        {children}
      </main>

      <nav className="bottom-nav" aria-label="Ops navigation">
        {OPS_NAV.map(({ href, label, icon: Icon }) => (
          <Link
            href={href}
            key={href}
            className={`bottom-link ${location === href ? 'active' : ''}`}
            data-testid={`link-ops-mobile-${href.split('/').pop()}`}
          >
            <Icon size={17} />
            <span>{label.split(' ')[0]}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
