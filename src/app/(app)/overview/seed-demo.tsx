'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/primitives';

/**
 * Loads six months of realistic demo finances so the app can be evaluated without
 * uploading real financial records first (spec §40).
 */
export function SeedDemoButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function load() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch('/api/demo/seed', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not load demo data.');
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button onClick={() => void load()} disabled={working || pending}>
        {working || pending ? 'Loading demo…' : 'Load demo data'}
      </Button>
      {error ? <p role="alert" className="text-xs text-[var(--negative)]">{error}</p> : null}
    </div>
  );
}
