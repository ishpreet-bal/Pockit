'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/ui/cn';

export interface NavWorkspace { id: string; name: string; kind: 'personal' | 'business'; isDemo: boolean }

const SECTIONS: { heading: string; items: { href: string; label: string; icon: string }[] }[] = [
  { heading: 'Money', items: [
    { href: '/overview', label: 'Overview', icon: '◎' },
    { href: '/transactions', label: 'Transactions', icon: '≡' },
    { href: '/accounts', label: 'Accounts', icon: '▤' },
  ] },
  { heading: 'Plan', items: [
    { href: '/budget', label: 'Budget', icon: '◧' },
    { href: '/goals', label: 'Goals', icon: '◆' },
    { href: '/forecast', label: 'Forecast', icon: '↗' },
    { href: '/calendar', label: 'Calendar', icon: '▦' },
  ] },
  { heading: 'Grow', items: [
    { href: '/analytics', label: 'Analytics', icon: '◔' },
    { href: '/recurring', label: 'Recurring', icon: '↻' },
    { href: '/debts', label: 'Debts', icon: '▼' },
    { href: '/business', label: 'Business', icon: '▣' },
  ] },
  { heading: 'Manage', items: [
    { href: '/imports', label: 'Imports', icon: '↥' },
    { href: '/assistant', label: 'Assistant', icon: '✦' },
    { href: '/settings', label: 'Settings', icon: '⚙' },
  ] },
];

const MOBILE_TABS = [
  { href: '/overview', label: 'Overview', icon: '◎' },
  { href: '/transactions', label: 'Activity', icon: '≡' },
  { href: '/imports/new', label: 'Add', icon: '+' },
  { href: '/budget', label: 'Budget', icon: '◧' },
];

export function Sidebar({ workspaces, activeId }: { workspaces: NavWorkspace[]; activeId: string }) {
  const pathname = usePathname();
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
        {SECTIONS.map((section) => (
          <div key={section.heading} className="mb-4">
            <p className="px-3 pb-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)]">
              {section.heading}
            </p>
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
                  )}
                >
                  <span className="w-4 text-center opacity-70" aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
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
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Primary"
    >
      {MOBILE_TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const isAdd = tab.href === '/imports/new';
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
            <span
              className={cn('text-base leading-none', isAdd && 'grid h-7 w-7 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)]')}
              aria-hidden
            >
              {tab.icon}
            </span>
            {tab.label}
          </Link>
        );
      })}
      <Link
        href="/settings"
        className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-2xs text-[var(--text-subtle)]"
      >
        <span className="text-base leading-none" aria-hidden>⋯</span>
        More
      </Link>
    </nav>
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
