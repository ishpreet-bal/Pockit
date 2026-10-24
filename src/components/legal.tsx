import type { ReactNode } from 'react';
import Link from 'next/link';

/** The shared frame for the privacy policy and terms: readable width, plain type. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-[15px] leading-relaxed text-[var(--text)]">
      <Link href="/welcome" className="text-sm text-[var(--text-muted)] hover:underline">← Pockit</Link>
      <h1 className="pk-display mt-6 text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">Last updated {updated}</p>
      <div className="mt-8 space-y-6 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </main>
  );
}

/** How to reach whoever runs Pockit. */
export function Contact({ email }: { email?: string }) {
  return email
    ? <a className="underline" href={`mailto:${email}`}>{email}</a>
    : <>the <strong>Send feedback</strong> option in the app or on the website</>;
}
