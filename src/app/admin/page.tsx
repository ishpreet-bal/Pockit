import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { isAdminEmail } from '@/lib/billing/plan';
import { getStats } from '@/lib/admin/stats';
import { PockMark } from '@/components/brand/pock-mark';

export const metadata: Metadata = { title: 'Pockit stats', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * For the people who run Pockit (ADMIN_EMAILS): how many people use it, counts only.
 * Anyone else gets a plain "not found", so the page doesn't even admit it exists.
 */
export default async function AdminStatsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in?next=/admin');
  if (!isAdminEmail(user.email)) notFound();
  const s = await getStats();
  const peak = Math.max(1, ...s.signupsByDay.map((d) => d.count));

  const tiles: [string, number, string?][] = [
    ['People with an account', s.people],
    ['New today', s.newToday],
    ['New this week', s.new7d],
    ['New in 30 days', s.new30d],
    ['Active this week', s.active7d, 'opened Pockit in the last 7 days'],
    ['Active this month', s.active30d],
    ['Banks connected', s.banksConnected, `${s.peopleWithBank} ${s.peopleWithBank === 1 ? 'person' : 'people'}`],
    ['Pockit Plus', s.plus],
    ['Looking around now', s.guestsNow, `${s.guestsStarted30d} guest visits in 30 days`],
    ['Accounts deleted', s.deletedAllTime, `${s.deleted30d} in 30 days`],
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-[var(--accent-soft)] text-[var(--accent)]"><PockMark className="h-6 w-6" /></span>
        <div>
          <h1 className="text-3xl">Pockit stats</h1>
          <p className="text-sm text-[var(--text-muted)]">Counts only. Nobody&rsquo;s details or money are shown here.</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value, note]) => (
          <div key={label} className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs text-[var(--text-muted)]">{label}</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-3xl tabular-nums">{value.toLocaleString('en-CA')}</p>
            {note ? <p className="mt-1 text-xs text-[var(--text-subtle)]">{note}</p> : null}
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold">Sign-ups, last 30 days</h2>
      <div className="mt-4 flex h-40 items-end gap-1 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4" role="img"
        aria-label={`Sign-ups per day over the last 30 days, ${s.new30d} in total`}>
        {s.signupsByDay.map((d) => (
          <div key={d.day} className="group relative flex-1" style={{ height: '100%' }} title={`${d.day}: ${d.count}`}>
            <div className="absolute bottom-0 w-full rounded-t-[4px] bg-[var(--accent)]" style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / peak) * 100)}%`, opacity: d.count ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-[var(--text-subtle)]">
        <span>{s.signupsByDay[0]?.day}</span><span>today</span>
      </div>
      <p className="mt-6 text-xs text-[var(--text-subtle)]">Deleted accounts and guest visits are counted from November 11, 2026, when counting started.</p>
    </div>
  );
}
