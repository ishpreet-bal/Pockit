import type { Metadata } from 'next';
import { LegalPage, Contact } from '@/components/legal';

export const metadata: Metadata = { title: 'Privacy policy · Pockit' };
export const dynamic = 'force-dynamic';

/**
 * Written to match what the code does. When a data flow changes (a new provider,
 * something newly stored), this page changes in the same commit.
 */
export default function PrivacyPage() {
  const email = process.env.SUPPORT_EMAIL?.trim() || undefined;
  return (
    <LegalPage title="Privacy policy" updated="October 24, 2026">
      <p>
        Pockit is a budgeting app. It holds some of the most personal information you have, so this page says plainly
        what it keeps, who else sees any of it, and how to make it go away.
      </p>

      <h2>What Pockit keeps</h2>
      <ul>
        <li><strong>Your account:</strong> your first name, email address, and your password, stored only as a one-way hash.</li>
        <li><strong>Your money records:</strong> accounts, balances, transactions, categories, budgets, bills, goals, split expenses, investments you choose to follow, and notes you write.</li>
        <li><strong>Files you import:</strong> statements and spreadsheets you upload, kept so an import can be checked and undone.</li>
        <li><strong>Conversations with Pock:</strong> the questions you ask and the answers, so a conversation can carry on.</li>
        <li><strong>Security records:</strong> sign-in times, failed sign-in attempts and an activity log of changes to your records, used to protect your account.</li>
      </ul>
      <p>
        Pockit does not show ads, does not sell or rent your information, and does not use tracking or advertising
        analytics. Face ID and app-lock settings stay on your phone. Notifications are scheduled on your phone.
      </p>

      <h2>Who else handles it</h2>
      <p>Pockit uses a small number of services to run. Each only gets what it needs for its job:</p>
      <ul>
        <li><strong>Hosting and database</strong> (Vercel, and a managed Postgres database): store and serve everything above, encrypted in transit.</li>
        <li><strong>Plaid</strong>, only if you connect a bank: you sign in to your bank through Plaid, and Pockit receives your accounts, balances and transactions. Your bank password never reaches Pockit. Plaid&rsquo;s own privacy policy applies to what you give Plaid.</li>
        <li><strong>An AI provider</strong> (Anthropic or OpenAI), only when you use a feature that needs one: asking Pock a question, scanning a receipt, or importing a screenshot or scanned statement. The question or image and the figures needed to answer it are sent; receipt photos are not kept by Pockit after they are read. These providers do not use this data to train their models under their business terms.</li>
        <li><strong>Maps</strong> (Google Maps, or OpenStreetMap services), only when you plan a trip: the places you search for and the start and end of the route.</li>
        <li><strong>Market data</strong> (Twelve Data or Finnhub): only the ticker symbols you look up. Nothing about you.</li>
        <li><strong>Apple and RevenueCat</strong>, only if you subscribe to Pockit Plus: Apple handles payment; RevenueCat tells Pockit whether your subscription is active.</li>
        <li><strong>Email</strong>, only to send you a password reset link you asked for.</li>
      </ul>

      <h2>Shared spaces</h2>
      <p>
        If you create or join a shared space, the other members can see everything recorded in that space. Your personal
        space stays private to you. Split expenses you record in your own space are visible only to you; the people you
        split with do not need a Pockit account and are not contacted.
      </p>

      <h2>How long it is kept, and deleting it</h2>
      <p>
        Your records are kept for as long as you have an account. You can delete your account at any time in the app
        (More → Settings → Delete account). That deletes your account and everything in it straight away, and disconnects
        any bank you connected. A shared space that other people still use is handed to one of them instead of being
        deleted. Copies in encrypted database backups expire within 30 days.
      </p>
      <p>You can also export your transactions at any time from the website.</p>

      <h2>Your rights</h2>
      <p>
        You can ask to see the information Pockit holds about you, ask for it to be corrected, or ask for it to be deleted.
        Canadian privacy law (PIPEDA) and, where they apply to you, other privacy laws give you these rights. Write to{' '}
        <Contact email={email} /> and you will get an answer within 30 days.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are hashed, sessions are signed and can be revoked, two-factor sign-in is available, every record is
        separated by account at the database level, and bank access tokens are encrypted. No system is perfectly secure; if
        something goes wrong that affects your information, you will be told.
      </p>

      <h2>Children</h2>
      <p>Pockit is not meant for children under 13 and does not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>If this policy changes in a way that matters, the app will tell you before the change takes effect.</p>

      <h2>Contact</h2>
      <p>Questions about privacy: <Contact email={email} />.</p>
    </LegalPage>
  );
}
