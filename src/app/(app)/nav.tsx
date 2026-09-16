'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/ui/cn';

export interface NavWorkspace { id: string; name: string; kind: 'personal' | 'business'; isDemo: boolean }

/**
 * Navigation is split by how often people need it, not by how the code is organised.
 *
 * Five everyday destinations sit at the top level. The rest are real, working features
 * but they answer occasional questions, so they live under "More" — visible enough to
 * discover, quiet enough not to compete. The previous eleven flat items made the app
 * look more complicated than it is.
 */
const PRIMARY: { href: string; label: string; icon: string }[] = [
  { href: '/overview', label: 'Overview', icon: '◎' },
  { href: '/transactions', label: 'Transactions', icon: '≡' },
  { href: '/budget', label: 'Budget', icon: '◧' },
  { href: '/goals', label: 'Goals', icon: '◆' },
  { href: '/calendar', label: 'Calendar', icon: '▦' },
];

const SECONDARY: { href: string; label: string; icon: string; blurb: string }[] = [
  { href: '/recurring', label: 'Recurring', icon: '↻', blurb: 'Bills and subscriptions that repeat' },
  { href: '/accounts', label: 'Accounts', icon: '▤', blurb: 'Balances and what you owe' },
  { href: '/imports', label: 'Import', icon: '↥', blurb: 'Bring in statements and receipts' },
  { href: '/analytics', label: 'Analytics', icon: '◔', blurb: 'Spending patterns over time' },
  { href: '/forecast', label: 'Forecast', icon: '↗', blurb: 'Where your balance is heading' },
  { href: '/debts', label: 'Debts', icon: '▼', blurb: 'Payoff plans and interest' },
  { href: '/business', label: 'Business', icon: '▣', blurb: 'Revenue, expenses and margin' },
  { href: '/assistant', label: 'Assistant', icon: '✦', blurb: 'Ask about your own records' },
  { href: '/settings', label: 'Settings', icon: '⚙', blurb: 'Profile, privacy and export' },
];

const MOBILE_TABS = [
  { href: '/overview', label: 'Overview', icon: '◎' },
  { href: '/transactions', label: 'Activity', icon: '≡' },
  { href: '/budget', label: 'Budget', icon: '◧' },
  { href: '/calendar', label: 'Calendar', icon: '▦' },
];

export function Sidebar({ workspaces, activeId }: { workspaces: NavWorkspace[]; activeId: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(
    () => SECONDARY.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)),
  );

  const link = (item: { href: string; label: string; icon: string }) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors',
          active
            ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
        )}
      >
        <span className="w-4 text-center opacity-70" aria-hidden>{item.icon}</span>
        {item.label}
      </Link>
    );
  };

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:flex">
      <div className="px-4 py-4">
        <Link href="/overview" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-sm font-semibold text-[var(--accent-fg)]">P</span>
          <span className="text-base font-semibold tracking-tight">Pockit</span>
        </Link>
      </div>

      <div className="px-3 pb-3">
        <WorkspaceSwitcher workspaces={workspaces} activeId={activeId} />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {PRIMARY.map(link)}

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className="mt-3 flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <span className="w-4 text-center opacity-70" aria-hidden>{moreOpen ? '−' : '+'}</span>
          More
        </button>

        {moreOpen ? <div className="mt-0.5">{SECONDARY.map(link)}</div> : null}
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        <ThemeToggle />
      </div>
    </aside>
  );
}

export function WorkspaceSwitcher({ workspaces, activeId }: { workspaces: NavWorkspace[]; activeId: string }) {
  const [busy, setBusy] = useState(false);
  const active = workspaces.find((w) => w.id === activeId);

  async function switchTo(id: string) {
    if (id === activeId) return;
    setBusy(true);
    await fetch('/api/workspace/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: id }),
    });
    window.location.reload();
  }

  return (
    <div className="relative">
      <select
        aria-label="Active workspace"
        value={activeId}
        disabled={busy}
        onChange={(e) => void switchTo(e.target.value)}
        className="h-9 w-full appearance-none rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-2)] pl-7 pr-7 text-sm font-medium text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>{w.name}{w.isDemo ? ' (demo)' : ''}</option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
        style={{ background: active?.kind === 'business' ? '#7d5ba6' : 'var(--accent)' }}
      />
      <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-subtle)]">▾</span>
    </div>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem('pockit-theme') as 'system' | 'light' | 'dark' | null) ?? 'system';
  });

  function apply(next: 'system' | 'light' | 'dark') {
    setTheme(next);
    try { localStorage.setItem('pockit-theme', next); } catch { /* private mode */ }
    const resolved = next === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : next;
    document.documentElement.setAttribute('data-theme', resolved);
  }

  return (
    <div role="group" aria-label="Colour theme" className="flex rounded-[var(--radius-control)] border border-[var(--border)] p-0.5">
      {(['system', 'light', 'dark'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => apply(t)}
          aria-pressed={theme === t}
          className={cn(
            'flex-1 rounded-[6px] py-1 text-xs capitalize transition-colors',
            theme === t ? 'bg-[var(--surface-3)] font-medium text-[var(--text)]' : 'text-[var(--text-subtle)] hover:text-[var(--text)]',
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function MobileTabs() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 lg:hidden"
          role="dialog" aria-modal="true" aria-label="More">
          <div className="max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl bg-[var(--surface)] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] animate-[pk-sheet-up_0.2s_ease-out]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">More</h2>
              <button type="button" onClick={() => setMoreOpen(false)}
                className="px-2 py-1 text-sm text-[var(--text-muted)]">Close</button>
            </div>
            <ul className="space-y-1">
              {[{ href: '/goals', label: 'Goals', icon: '◆', blurb: 'What you are saving towards' }, ...SECONDARY].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 rounded-[var(--radius-control)] p-3 hover:bg-[var(--surface-2)]">
                    <span className="w-5 text-center opacity-70" aria-hidden>{item.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-xs text-[var(--text-muted)]">{item.blurb}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-[var(--border)] pt-3"><ThemeToggle /></div>
          </div>
        </div>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Primary"
      >
        {MOBILE_TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-2xs',
                active ? 'text-[var(--accent)]' : 'text-[var(--text-subtle)]',
              )}
            >
              <span className="text-base leading-none" aria-hidden>{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-2xs text-[var(--text-subtle)]"
        >
          <span className="text-base leading-none" aria-hidden>⋯</span>
          More
        </button>
      </nav>
    </>
  );
}

export function MobileHeader({ workspaces, activeId }: { workspaces: NavWorkspace[]; activeId: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 lg:hidden">
      <Link href="/overview" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-sm font-semibold text-[var(--accent-fg)]">
        P
      </Link>
      <div className="min-w-0 flex-1"><WorkspaceSwitcher workspaces={workspaces} activeId={activeId} /></div>
    </header>
  );
}
