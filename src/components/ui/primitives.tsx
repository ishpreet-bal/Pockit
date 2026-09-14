import { cn } from '@/lib/ui/cn';
import type { ReactNode, HTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

/* ---------------- Card ---------------- */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title, action, description, className,
}: { title: ReactNode; action?: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--text-muted)]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--text-subtle)]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

/* ---------------- Empty state ---------------- */

/** Never ship an empty card: one sentence of explanation and one action. */
export function EmptyState({
  icon, title, description, action,
}: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="text-2xl opacity-60">{icon}</div> : null}
      <p className="text-base font-medium text-[var(--text)]">{title}</p>
      <p className="max-w-sm text-sm text-[var(--text-muted)]">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ---------------- Button ---------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] border-transparent',
  secondary: 'bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)] border-[var(--border-strong)]',
  ghost: 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] border-transparent',
  danger: 'bg-[var(--negative)] text-white hover:opacity-90 border-transparent',
};

export function Button({ className, variant = 'secondary', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border font-medium',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

/** A link that looks like a button. Navigation stays an anchor, so it remains
 *  middle-clickable and keyboard-accessible as a link should be. */
export function LinkButton({
  href, variant = 'secondary', size = 'md', className, children,
}: { href: string; variant?: NonNullable<ButtonProps['variant']>; size?: 'sm' | 'md'; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border font-medium transition-colors',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </a>
  );
}

/* ---------------- Form controls ---------------- */

export function Field({
  label, hint, error, htmlFor, children, className,
}: { label: string; hint?: string; error?: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--text)]">{label}</label>
      {children}
      {error ? <p className="text-xs text-[var(--negative)]">{error}</p>
        : hint ? <p className="text-xs text-[var(--text-subtle)]">{hint}</p> : null}
    </div>
  );
}

const CONTROL = 'h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, 'appearance-none pr-8', className)} {...props}>{children}</select>;
}

/* ---------------- Badge ---------------- */

const BADGE_TONES = {
  neutral: 'bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)]',
  positive: 'bg-[var(--positive-soft)] text-[var(--positive)] border-transparent',
  negative: 'bg-[var(--negative-soft)] text-[var(--negative)] border-transparent',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)] border-transparent',
  info: 'bg-[var(--info-soft)] text-[var(--info)] border-transparent',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)] border-transparent',
} as const;

export function Badge({
  tone = 'neutral', children, className,
}: { tone?: keyof typeof BADGE_TONES; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium', BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

/* ---------------- Progress ---------------- */

/**
 * A budget bar carries two facts: how much is spent, and how much of the period has
 * passed. Showing only the first makes "68% spent" unreadable — 68% is fine on day 25
 * and alarming on day 5. The marker is what makes the bar meaningful.
 */
export function ProgressBar({
  fraction, markerFraction, tone = 'accent', className,
}: { fraction: number; markerFraction?: number; tone?: 'accent' | 'positive' | 'warning' | 'negative'; className?: string }) {
  const pct = Math.max(0, Math.min(100, fraction * 100));
  const over = fraction > 1;
  const color = over ? 'var(--negative)' : tone === 'warning' ? 'var(--warning)' : tone === 'positive' ? 'var(--positive)' : tone === 'negative' ? 'var(--negative)' : 'var(--accent)';
  return (
    <div className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]', className)}>
      <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: color }} />
      {markerFraction !== undefined && markerFraction > 0 && markerFraction < 1 ? (
        <div
          className="absolute top-0 h-full w-px bg-[var(--text-subtle)] opacity-70"
          style={{ left: `${Math.min(100, markerFraction * 100)}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

/* ---------------- Skeleton ---------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('pk-skeleton', className)} />;
}

/* ---------------- Table ---------------- */

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}

export function Th({ className, numeric, ...props }: HTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        'sticky top-0 z-10 whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2',
        'text-xs font-medium uppercase tracking-[0.04em] text-[var(--text-subtle)]',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, numeric, ...props }: HTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn('border-b border-[var(--border)] px-3 py-2.5 align-middle', numeric && 'text-right tabular', className)}
      {...props}
    />
  );
}
