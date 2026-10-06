'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, ArrowLeftRight, Target, LineChart, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Monitor, Sun, Moon, ChevronDown, X,
} from 'lucide-react';
import { Logo, Mark } from '@/components/brand/logo';
import { MORE_ITEMS } from './nav-items';
import { Mascot } from '@/components/brand/mascot';
import { cn } from '@/lib/ui/cn';

export interface NavWorkspace { id: string; name: string; kind: 'personal' | 'business' | 'household'; isDemo: boolean }

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;

/**
 * Navigation is split by how often people need it, not by how the code is organised.
 *
 * Five everyday destinations sit at the top level. The rest are real, working features
 * but they answer occasional questions, so they live under "More" — visible enough to
 * discover, quiet enough not to compete.
 */
const PRIMARY: { href: string; label: string; icon: Icon }[] = [
  { href: '/overview', label: 'Home', icon: LayoutDashboard },
  { href: '/transactions', label: 'Spending', icon: ArrowLeftRight },
  { href: '/goals', label: 'Goals', icon: Target },
];

/**
 * Investing sits one step below the three core tabs: visible in the sidebar and the
 * phone's tab bar, and first in More — but set apart, because Pockit is a
 * budgeting app first and investing is where some people go next.
 */
const INVESTING = { href: '/investing', label: 'Investing', icon: LineChart };

const MOBILE_TABS: { href: string; label: string; icon: Icon }[] = [
  ...PRIMARY,
  { href: '/investing', label: 'Invest', icon: LineChart },
];

/** Sibling routes that live as tabs under one nav entry, so the entry stays lit. */
const TAB_SIBLINGS: Record<string, string[]> = {
  // Budget is part of Spending now, so Spending stays lit while you are in it.
  '/transactions': ['/budget'],
  '/more': MORE_ITEMS.map((i) => i.href),
  '/accounts': ['/debts'],
  '/analytics': ['/forecast'],
};

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => {
    if (pathname === href || pathname.startsWith(`${href}/`)) return true;
    return (TAB_SIBLINGS[href] ?? []).some((s) => pathname === s || pathname.startsWith(`${s}/`));
  };
}

/* ---------------- Sidebar ---------------- */

const COLLAPSE_KEY = 'pockit-sidebar-collapsed';

export function Sidebar({ workspaces, activeId }: { workspaces: NavWorkspace[]; activeId: string }) {
  const isActive = useIsActive();
  const [collapsed, setCollapsed] = useState(false);

  // Read the stored preference after mount rather than during render: the server has
  // no localStorage, and initialising from it directly would hydrate mismatched.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch { /* private mode */ }
  }, []);

  function toggleCollapse() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  }

  const link = (item: { href: string; label: string; icon: Icon }) => {
    const active = isActive(item.href);
    const Ico = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        // A stable hook for the guided tour, independent of styling. Classes get
        // rewritten every design pass; this does not.
        data-tour={`nav-${item.href.replace('/', '')}`}
        title={collapsed ? item.label : undefined}
        className={cn(
          'group relative flex items-center gap-3 rounded-[var(--radius-control)] py-2 text-sm transition-colors',
          collapsed ? 'justify-center px-0' : 'px-3',
          active
            ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
        )}
      >
        {/* The accent bar anchors the active row to the edge of the rail, so the eye
            finds "where am I" without having to read any label. */}
        {active ? (
          <motion.span
            layoutId="nav-active-bar"
            aria-hidden
            className="absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[var(--accent)]"
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          />
        ) : null}
        <Ico className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
        {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-[width] duration-200 md:flex',
        collapsed ? 'w-[72px]' : 'w-60',
      )}
    >
      <div className={cn('flex items-center gap-2 py-4', collapsed ? 'justify-center px-2' : 'px-4')}>
        <Link href="/overview" aria-label="Pockit">
          <Logo size="sm" showWordmark={!collapsed} />
        </Link>
      </div>

      {collapsed ? null : (
        <div className="px-3 pb-3">
          <WorkspaceSwitcher workspaces={workspaces} activeId={activeId} />
        </div>
      )}

      <nav className={cn('flex-1 space-y-0.5 overflow-y-auto pb-4', collapsed ? 'px-3' : 'px-4')}>
        {PRIMARY.map(link)}

        <div className="my-3 border-t border-[var(--border)]" />
        {link(INVESTING)}
        {link({ href: '/more', label: 'More', icon: MoreHorizontal })}
      </nav>

      <div className={cn('space-y-2 border-t border-[var(--border)] p-3', collapsed && 'px-2')}>
        {collapsed ? null : <ThemeToggle />}
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-xs text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
            collapsed && 'justify-center',
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {collapsed ? null : 'Collapse'}
        </button>
      </div>
    </aside>
  );
}

/* ---------------- Workspace switcher ---------------- */

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
        className="h-10 w-full appearance-none rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-2)] pl-7 pr-8 text-sm font-medium text-[var(--text)] transition-colors focus:border-[var(--accent)] focus:outline-none"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>{w.name}{w.isDemo ? ' (demo)' : ''}</option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
        style={{ background: active?.kind === 'business' ? 'var(--goal)' : 'var(--accent)' }}
      />
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
    </div>
  );
}

/* ---------------- Theme ---------------- */

const THEMES: { value: 'system' | 'light' | 'dark'; icon: Icon; label: string }[] = [
  { value: 'system', icon: Monitor, label: 'System' },
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
];

export function ThemeToggle() {
  // Unset means dark — the toggle must show what the page actually looks like,
  // not highlight "System" over a dark screen on someone whose OS is light.
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('dark');

  useEffect(() => {
    try {
      setTheme((localStorage.getItem('pockit-theme') as 'system' | 'light' | 'dark' | null) ?? 'dark');
    } catch { /* private mode */ }
  }, []);

  function apply(next: 'system' | 'light' | 'dark') {
    setTheme(next);
    try { localStorage.setItem('pockit-theme', next); } catch { /* private mode */ }
    const resolved = next === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : next;
    document.documentElement.setAttribute('data-theme', resolved);
  }

  return (
    <div role="group" aria-label="Colour theme" className="flex rounded-[var(--radius-control)] bg-[var(--surface-2)] p-1">
      {THEMES.map((t) => {
        const Ico = t.icon;
        const on = theme === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => apply(t.value)}
            aria-pressed={on}
            title={t.label}
            className={cn(
              'flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors',
              on ? 'bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-subtle)] hover:text-[var(--text)]',
            )}
          >
            <Ico className="h-4 w-4" strokeWidth={1.9} />
            <span className="sr-only">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Mobile ---------------- */

export function MobileTabs() {
  const isActive = useIsActive();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <AnimatePresence>
        {moreOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end md:hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setMoreOpen(false)} aria-hidden />
            <motion.div
              role="dialog" aria-modal="true" aria-label="More"
              className="relative z-10 max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl bg-[var(--surface)] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[var(--shadow-lg)]"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">More</h2>
                <button
                  type="button" onClick={() => setMoreOpen(false)} aria-label="Close"
                  className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="space-y-1">
                {MORE_ITEMS.map((item) => {
                  const Ico = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href} onClick={() => setMoreOpen(false)}
                        className="flex items-center gap-3 rounded-[var(--radius-control)] p-3 transition-colors hover:bg-[var(--surface-2)]"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--surface-2)] text-[var(--text-muted)]">
                          <Ico className="h-[18px] w-[18px]" strokeWidth={1.8} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{item.label}</span>
                          <span className="block text-xs text-[var(--text-muted)]">{item.blurb}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 border-t border-[var(--border)] pt-3"><ThemeToggle /></div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--border)] bg-[var(--surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
        aria-label="Primary"
      >
        {MOBILE_TABS.map((tab) => {
          const active = isActive(tab.href);
          const Ico = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              data-tour={`nav-${tab.href.replace('/', '')}`}
              className={cn(
                'relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-2xs transition-colors',
                active ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-subtle)]',
              )}
            >
              {active ? (
                <motion.span
                  layoutId="tab-active"
                  aria-hidden
                  className="absolute inset-x-3 top-0 h-0.5 rounded-b-full bg-[var(--accent)]"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              ) : null}
              <Ico className="h-[20px] w-[20px]" strokeWidth={active ? 2.2 : 1.8} />
              {tab.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className="flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-2xs text-[var(--text-subtle)]"
        >
          <MoreHorizontal className="h-[20px] w-[20px]" strokeWidth={1.8} />
          More
        </button>
      </nav>
    </>
  );
}

export function MobileHeader({ workspaces, activeId }: { workspaces: NavWorkspace[]; activeId: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 py-2.5 backdrop-blur-lg md:hidden">
      <Link
        href="/overview"
        aria-label="Pockit"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--accent-fill)] text-[var(--accent-fill-fg)]"
      >
        <Mark className="h-4.5 w-4.5" />
      </Link>
      <div className="min-w-0 flex-1"><WorkspaceSwitcher workspaces={workspaces} activeId={activeId} /></div>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event('pock:open'))}
        aria-label="Ask Pock"
        data-tour="pock"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)]"
      >
        <Mascot mood="idle" className="h-8 w-8" />
      </button>
    </header>
  );
}
