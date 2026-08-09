import { Bell, ChevronRight, LayoutGrid, Palette, ScrollText, Search, ShieldCheck, Sparkles, UserRound, WalletCards } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { isApiConfigured } from '@/lib/config';

/**
 * The furniture every designer screen shares.
 *
 * Deliberately its own copy rather than an import from App.tsx: the designer
 * space has a different sidebar, and a screen here should not break when the
 * customer shell changes shape.
 */

export type ToastState = { message: string } | null;

function Brand() {
  return (
    <Link href="/" className="brand" data-testid="link-brand">
      <span className="brand-mark">
        <span>Z</span>
      </span>
      <span>Zari</span>
    </Link>
  );
}

/**
 * Shown when a screen is rendering the bundled demo studio rather than live
 * data. Passing demo numbers off as a designer's real earnings would break the
 * one promise the product is built on, so this stays visible — just quiet.
 */
export function DemoNote({ isLive }: { isLive: boolean }) {
  if (isLive || !isApiConfigured) return null;
  return (
    <span
      className="demo-note"
      title="The server is unreachable, so Zari is showing sample content."
      data-testid="status-demo-data"
    >
      Sample data
    </span>
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  onClick,
  type = 'button',
  testId,
  disabled = false,
}: {
  children: React.ReactNode;
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
      data-testid={testId}
    >
      {children}
    </button>
  );
}

export function Toast({
  toast,
  setToast,
}: {
  toast: ToastState;
  setToast: (toast: ToastState) => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast, setToast]);

  return toast ? (
    <div className="toast-note" role="status" data-testid="status-toast">
      {toast.message}
    </div>
  ) : null;
}

const NAV = [
  { href: '/designer', label: 'Dashboard', icon: LayoutGrid },
  { href: '/designer/bids', label: 'Quotes', icon: ScrollText },
  { href: '/designer/copilot', label: 'Copilot', icon: Sparkles },
  { href: '/designer/earnings', label: 'Earnings', icon: WalletCards },
  { href: '/designer/quality', label: 'Quality', icon: ShieldCheck },
] as const;

/** Mobile bar keeps to four so the labels stay readable. */
const MOBILE_NAV = NAV.slice(0, 4);

export function DesignerShell({
  studioName,
  breadcrumb,
  children,
}: {
  studioName?: string;
  breadcrumb: string;
  children: React.ReactNode;
}) {
  const [location] = useLocation();
  const name = studioName ?? 'Your studio';
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('') || 'ZS';

  const isActive = (href: string) =>
    href === '/designer' ? location === href : location.startsWith(href);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="nav-label eyebrow">Designer space</div>
        <nav className="side-nav">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              href={href}
              className={`side-link ${isActive(href) ? 'active' : ''}`}
              key={href}
              data-testid={`link-nav-${label.toLowerCase()}`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="side-bottom">
          <Link href="/designer/profile" className="side-link" data-testid="link-designer-profile">
            <Palette size={16} />
            Studio profile
          </Link>
          <div className="profile-mini">
            <span className="avatar">{initials}</span>
            <span>{name}</span>
          </div>
        </div>
      </aside>

      <div className="mobile-header">
        <Brand />
        <div className="top-actions">
          <Link
            href="/designer/profile"
            className="icon-button"
            aria-label="Studio profile"
            data-testid="link-mobile-designer-profile"
          >
            <UserRound size={16} />
          </Link>
        </div>
      </div>

      <main className="app-main">
        <div className="app-topbar">
          <div className="breadcrumbs">
            <span>DESIGNER SPACE</span>
            <ChevronRight size={12} />
            <span>{breadcrumb.toUpperCase()}</span>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Search" data-testid="button-designer-search">
              <Search size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Notifications"
              data-testid="button-designer-notifications"
            >
              <Bell size={16} />
            </button>
          </div>
        </div>
        {children}
      </main>

      <nav className="bottom-nav" aria-label="Designer navigation">
        {MOBILE_NAV.map(({ href, label, icon: Icon }) => (
          <Link
            href={href}
            className={`bottom-link ${isActive(href) ? 'active' : ''}`}
            key={href}
            data-testid={`link-mobile-${label.toLowerCase()}`}
          >
            <Icon size={17} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
