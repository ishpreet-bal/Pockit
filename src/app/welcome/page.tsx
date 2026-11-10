import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { PockMark } from '@/components/brand/pock-mark';
import { LivePhone } from './live-phone';

export const metadata: Metadata = {
  title: 'Pockit: know what you can spend',
  description: 'Pockit counts your bills, your pay and your plans, and gives you one honest number: what you can spend today. Free to start, no account needed to look around.',
};
export const dynamic = 'force-dynamic';

/**
 * The website for anyone not signed in. Its centrepiece is the real app running in
 * a phone (the same build as the iPhone app, from /app), so what people see here is
 * what they get. Everything else answers the questions a careful person asks before
 * trusting an app with their money.
 */
export default async function WelcomePage() {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await getSessionUser();
  } catch {
    redirect('/setup');
  }
  if (user) redirect('/overview');

  return (
    <div className="min-h-[100svh] overflow-x-hidden">
      <Nav />
      <Hero />
      <OneNumber />
      <Features />
      <HowItWorks />
      <Safety />
      <Faq />
      <FinalCall />
      <Footer />
    </div>
  );
}

const wrap = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
const primary = 'inline-flex h-12 items-center justify-center rounded-[14px] bg-[var(--accent-fill)] px-6 text-base font-semibold text-[var(--accent-fill-fg)] transition-opacity hover:opacity-90';
const secondary = 'inline-flex h-12 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-6 text-base font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-2)]';
const eyebrow = 'text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]';
const h2 = 'pk-display text-[2rem] leading-[1.1] tracking-[-0.02em] sm:text-[2.6rem]';

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur">
      <div className={`${wrap} flex h-16 items-center gap-6`}>
        <Link href="/welcome" className="flex items-center gap-2" aria-label="Pockit home">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]"><PockMark className="h-5 w-5" /></span>
          <span className="font-[family-name:var(--font-display)] text-xl">Pockit</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-6 text-sm text-[var(--text-muted)] md:flex">
          <a href="#features" className="hover:text-[var(--text)]">Features</a>
          <a href="#how" className="hover:text-[var(--text)]">How it works</a>
          <a href="#safety" className="hover:text-[var(--text)]">Your data</a>
          <a href="#faq" className="hover:text-[var(--text)]">Questions</a>
        </nav>
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <Link href="/sign-in" className="text-sm font-semibold text-[var(--text)] hover:text-[var(--accent)]">Sign in</Link>
          <Link href="/sign-up" className="inline-flex h-9 items-center rounded-[10px] bg-[var(--accent-fill)] px-4 text-sm font-semibold text-[var(--accent-fill-fg)] hover:opacity-90">Get started</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className={`${wrap} grid items-center gap-12 pb-16 pt-12 md:grid-cols-[1.1fr_1fr] md:pt-20`}>
      <div className="pk-assemble flex flex-col">
        <p className={eyebrow}>For you, your family, and your friends</p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-[2.9rem] leading-[1.02] tracking-[-0.03em] sm:text-[4rem]">
          Know what you<br />can spend.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
          Pockit counts your bills, your pay and your plans, and gives you one honest number every morning: what’s
          actually yours to spend today. Your bank fills it in. You stay in charge.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className={primary}>Get started, free</Link>
          <Link href="/demo" className={secondary}>Look around first</Link>
        </div>
        <p className="mt-4 text-sm text-[var(--text-subtle)]">No account needed to look around. Read-only bank access. Delete everything any time.</p>
        <Link href="/sign-in" className="mt-6 w-fit text-sm font-semibold text-[var(--accent)] hover:underline">I already have an account →</Link>
      </div>
      <div className="flex justify-center md:justify-end">
        <LivePhone />
      </div>
    </section>
  );
}

function OneNumber() {
  const rows: [string, string, string][] = [
    ['Today', 'You are here', '$2,198'],
    ['Thu', 'Toronto Hydro', '−104.97'],
    ['Sat', 'Netflix', '−16.49'],
    ['Mon', 'Payday', '+2,315.00'],
  ];
  return (
    <section className="border-y border-[var(--border)] bg-[var(--surface)]">
      <div className={`${wrap} grid items-center gap-12 py-20 md:grid-cols-2`}>
        <div>
          <p className={eyebrow}>The one number</p>
          <h2 className={`mt-3 ${h2}`}>Not your balance. What’s left after what’s coming.</h2>
          <p className="mt-5 text-lg leading-relaxed text-[var(--text-muted)]">
            A balance says $2,840. It doesn’t say rent is Thursday or that the Visa is $642. Pockit takes your everyday
            money, subtracts what you owe on cards and the bills due before payday, and tells you what’s safe, per day,
            until money comes in.
          </p>
        </div>
        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg)] p-6 shadow-[var(--shadow-md)] sm:p-8">
          <p className="font-[family-name:var(--font-display)] text-5xl text-[var(--accent)]">$1,796</p>
          <p className="mt-1 text-[var(--text-muted)]">safe to spend · 6 days to payday · $299/day</p>
          <ol className="mt-6 space-y-4">
            {rows.map(([when, what, amount], i) => (
              <li key={what} className="flex items-center gap-4">
                <span className="w-12 text-sm text-[var(--text-subtle)]">{when}</span>
                <span className={`h-3 w-3 shrink-0 rounded-full ${i === 0 ? 'bg-[var(--accent)]' : 'border-2 border-[var(--accent)]'}`} />
                <span className="flex-1">{what}</span>
                <span className={`tabular-nums ${amount.startsWith('+') ? 'text-[var(--positive)]' : amount.startsWith('−') ? 'text-[var(--negative)]' : ''}`}>{amount}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

// Four columns: two wide, four narrow, two wide, so every row is full.
const FEATURES: { title: string; body: string; big?: boolean }[] = [
  { title: 'Your bank, read-only', body: 'Connect through Plaid and your accounts, balances and transactions arrive on their own, sorted into categories. Pockit can see, never move, your money.', big: true },
  { title: 'Split with friends', body: 'Dinner for four on your card? Only your part counts. Pockit keeps who owes who, both ways, and knows an e-Transfer back isn’t income.', big: true },
  { title: 'Bills and payday', body: 'A countdown to payday with every bill on the way, so nothing sneaks up on you.' },
  { title: 'A budget that writes itself', body: 'Answer a few questions when you sign up and your first budget is ready.' },
  { title: 'Goals', body: 'Emergency fund, a trip, a car. See how far along you are and what it takes per payday.' },
  { title: 'Ask Pock', body: 'Questions about your own numbers, answered plainly. Pock asks before sharing anything with an AI company.' },
  { title: 'Budget together', body: 'A shared space for a partner or roommates for the money you share, while your own money stays your own.', big: true },
  { title: 'Plan a trip', body: 'Pick your real car, from every model sold since 1984, and see what the gas will cost before you leave the driveway.', big: true },
];

function Features() {
  return (
    <section id="features" className={`${wrap} scroll-mt-20 py-20`}>
      <p className={eyebrow}>What’s inside</p>
      <h2 className={`mt-3 max-w-2xl ${h2}`}>Everything a household’s money needs. Nothing it doesn’t.</h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <article key={f.title} className={`rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-6 ${f.big ? 'lg:col-span-2' : ''}`}>
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]"><PockMark className="h-5 w-5" /></span>
            <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 leading-relaxed text-[var(--text-muted)]">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps: [string, string][] = [
    ['Answer a few questions', 'What brings you here, who you’re budgeting for, when you’re paid and what your bills are. About two minutes.'],
    ['Connect your bank, or don’t', 'Sign in to your bank on its own secure page through Plaid. Prefer typing things in? That works too.'],
    ['Check one number', 'Open Pockit and see what you can spend today. Pock tells you when something needs a look.'],
  ];
  return (
    <section id="how" className="scroll-mt-20 border-y border-[var(--border)] bg-[var(--surface)]">
      <div className={`${wrap} py-20`}>
        <p className={eyebrow}>How it works</p>
        <h2 className={`mt-3 ${h2}`}>Set up over a coffee.</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map(([title, body], i) => (
            <li key={title} className="rounded-[20px] border border-[var(--border)] bg-[var(--bg)] p-6">
              <span className="font-[family-name:var(--font-display)] text-4xl text-[var(--accent)]">{i + 1}</span>
              <h3 className="mt-3 text-lg font-semibold">{title}</h3>
              <p className="mt-2 leading-relaxed text-[var(--text-muted)]">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Safety() {
  const points: [string, string][] = [
    ['Your bank password never reaches us', 'You sign in on your bank’s page through Plaid. Pockit gets read-only access and can’t move money.'],
    ['Locked down at the database', 'Every person’s records are walled off by the database itself, not just by our code. Bank access is encrypted and tied to your account.'],
    ['AI only with your yes', 'Pock names the AI company and asks before anything is sent. Say no and it never is.'],
    ['Leave whenever you like', 'Delete your account from Settings and everything goes, bank connections included.'],
    ['We don’t sell your data', 'Not to advertisers, not to anyone. The privacy policy lists every company that touches your data and why.'],
  ];
  return (
    <section id="safety" className={`${wrap} scroll-mt-20 py-20`}>
      <p className={eyebrow}>Your data</p>
      <h2 className={`mt-3 max-w-2xl ${h2}`}>Built like it’s our own money in there.</h2>
      <ul className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
        {points.map(([title, body]) => (
          <li key={title} className="flex gap-4">
            <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--positive-soft)] text-sm font-bold text-[var(--positive)]">✓</span>
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 leading-relaxed text-[var(--text-muted)]">{body}</p>
            </div>
          </li>
        ))}
      </ul>
      <Link href="/privacy" className="mt-8 inline-block text-sm font-semibold text-[var(--accent)] hover:underline">Read the privacy policy →</Link>
    </section>
  );
}

function Faq() {
  const qs: [string, string][] = [
    ['Is it free?', 'Yes, to start and for everyday budgeting. You can look around without an account at all.'],
    ['Do I have to connect my bank?', 'No. You can add purchases yourself, scan receipts, or import a statement. Connecting a bank just saves the typing.'],
    ['Which banks work?', 'Most banks and credit unions in Canada and the US, through Plaid.'],
    ['Can my partner or roommates use it with me?', 'Yes. Make a shared space for the money you share, and keep your own space for the rest.'],
    ['What if a friend owes me money?', 'Split the purchase and Pockit counts only your part, then keeps track of who still owes you, and what you owe others.'],
    ['Does Pockit give financial advice?', 'No. It shows you your own numbers clearly and helps you learn. Big decisions are yours.'],
  ];
  return (
    <section id="faq" className="scroll-mt-20 border-t border-[var(--border)] bg-[var(--surface)]">
      <div className={`${wrap} grid gap-10 py-20 md:grid-cols-[1fr_1.6fr]`}>
        <div>
          <p className={eyebrow}>Questions</p>
          <h2 className={`mt-3 ${h2}`}>The fair ones.</h2>
        </div>
        <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {qs.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                {q}
                <span className="text-[var(--accent)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-[var(--text-muted)]">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCall() {
  return (
    <section className={`${wrap} py-24 text-center`}>
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-[18px] bg-[var(--accent-soft)] text-[var(--accent)]"><PockMark className="h-9 w-9" /></span>
      <h2 className={`mx-auto mt-6 max-w-xl ${h2}`}>Know where you stand by tomorrow morning.</h2>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/sign-up" className={primary}>Get started, free</Link>
        <Link href="/demo" className={secondary}>Look around first</Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--border)]">
      <div className={`${wrap} flex flex-col gap-4 py-8 text-sm text-[var(--text-subtle)] sm:flex-row sm:items-center`}>
        <span className="flex items-center gap-2"><PockMark className="h-4 w-4 text-[var(--accent)]" /> Pockit · made in Canada</span>
        <nav className="flex gap-5 sm:ml-auto">
          <Link href="/privacy" className="hover:text-[var(--text)]">Privacy</Link>
          <Link href="/terms" className="hover:text-[var(--text)]">Terms</Link>
          <Link href="/sign-in" className="hover:text-[var(--text)]">Sign in</Link>
        </nav>
      </div>
    </footer>
  );
}
