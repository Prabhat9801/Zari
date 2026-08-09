import { useEffect, type ReactNode } from 'react';
import { isApiConfigured } from '@/lib/config';
import { ApiError } from '@/lib/apiClient';

/**
 * The small shared parts of the budget optimizer.
 *
 * Deliberately local copies rather than imports out of `App.tsx`: this panel is
 * meant to be mounted anywhere — the studio, a route of its own, a dialog — and
 * a component that reaches back into the page shell cannot be.
 */

export type ToastState = { message: string } | null;

/**
 * Shown when the panel is rendering the bundled demo set rather than live data.
 * Passing demo content off as real would break the one promise the product is
 * built on, so this is deliberately visible — just quiet.
 */
export function DemoNote({ isLive }: { isLive: boolean }) {
  if (isLive || !isApiConfigured) return null;
  return (
    <span
      className="demo-note"
      title="The server is unreachable, so Zari is showing a sample budget pass."
      data-testid="status-demo-data"
    >
      Sample data
    </span>
  );
}

export function BudgetButton({
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

export function BudgetToast({
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
    <div className="toast-note" role="status" data-testid="status-budget-toast">
      {toast.message}
    </div>
  ) : null;
}

/** Errors are human-readable here too. Never a status code, never a stack. */
export const messageFor = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

/**
 * Shown instead of a plan when the panel is on the demo set. The optimizer is
 * free and harmless, but inventing a plan for a design the server has never
 * seen would be a lie about a price — the one thing this product will not do.
 */
export const demoOnlyMessage =
  'This panel is showing a sample budget pass, so Zari cannot price a new target from here. The toggles below still work on the sample so you can see how the trade-offs read.';
