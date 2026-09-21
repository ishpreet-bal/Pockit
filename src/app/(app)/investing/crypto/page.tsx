import type { Metadata } from 'next';
import { DiscoveryPage } from '../discovery-page';

export const metadata: Metadata = { title: 'Crypto' };
export const dynamic = 'force-dynamic';

export default function CryptoPage() {
  return (
    <>
      <div className="mb-4 rounded-[var(--radius-card)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-3 text-sm">
        <strong>Cryptocurrencies are not securities.</strong>{' '}
        <span className="text-[var(--text-muted)]">
          They are not covered by investor protection schemes, they can move far more violently than
          shares or funds, and it is possible to lose everything you put in. Pockit lists them because
          people hold them, not as an endorsement.
        </span>
      </div>
      <DiscoveryPage
        kind="crypto"
        methodology={
          'Grouped by rough market size using a hand-maintained reference list, not a live ranking. ' +
          'Prices come from the source named below. Nothing here is a recommendation.'
        }
      />
    </>
  );
}
