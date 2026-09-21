'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

/** Follow or unfollow, with the state flipping immediately rather than after a round trip. */
export function WatchButton({
  symbol, name, initiallyWatched,
}: { symbol: string; name: string; initiallyWatched: boolean }) {
  const router = useRouter();
  const [watched, setWatched] = useState(initiallyWatched);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !watched;
    setWatched(next);
    setBusy(true);
    try {
      if (next) {
        await fetch('/api/investing/watchlist', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ symbol, name }),
        });
      } else {
        await fetch(`/api/investing/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      }
      router.refresh();
    } catch {
      setWatched(!next); // Put it back; the server disagreed.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={watched ? 'secondary' : 'primary'} disabled={busy} onClick={() => void toggle()}>
      <Star className="h-4 w-4" fill={watched ? 'currentColor' : 'none'} strokeWidth={2} />
      {watched ? 'Following' : 'Follow'}
    </Button>
  );
}
