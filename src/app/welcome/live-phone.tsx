'use client';

import { useEffect, useState } from 'react';

/**
 * The real app, running in a phone. It is the same build as the iPhone app
 * (served at /app), so "Look around first" inside it opens a real guest account.
 * The status bar clock is the visitor's own time, which is what a phone shows.
 */
export function LivePhone() {
  const [time, setTime] = useState('9:41');
  const [key, setKey] = useState(0);
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, ''));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <figure className="flex flex-col items-center gap-4">
      <div className="relative w-[min(340px,86vw)] rounded-[52px] bg-[#0d0d0c] p-[11px] shadow-[0_0_0_2px_#2c2b27,0_40px_90px_-20px_rgba(60,30,10,0.45)]">
        <div className="relative overflow-hidden rounded-[42px] bg-[var(--bg)]" style={{ aspectRatio: '390 / 844' }}>
          <div className="absolute inset-x-0 top-0 z-10 flex h-11 items-center justify-between px-7 text-[13px] font-semibold text-[var(--text)]">
            <span className="tabular-nums">{time}</span>
            <span className="absolute left-1/2 top-2.5 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-[#0d0d0c]" aria-hidden />
            <span aria-hidden className="flex items-center gap-1">
              <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="4.5" y="5" width="3" height="6" rx="1" /><rect x="9" y="2.5" width="3" height="8.5" rx="1" /><rect x="13.5" y="0" width="3" height="11" rx="1" /></svg>
              <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="currentColor" opacity="0.4" /><rect x="2" y="2" width="16" height="8" rx="1.5" fill="currentColor" /><rect x="22.5" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" opacity="0.4" /></svg>
            </span>
          </div>
          <iframe
            key={key}
            src="/app"
            title="The Pockit app, running live"
            loading="lazy"
            className="absolute inset-x-0 bottom-0 top-11 h-[calc(100%-2.75rem)] w-full border-0"
          />
        </div>
      </div>
      <figcaption className="flex items-center gap-4 text-sm text-[var(--text-subtle)]">
        <span>The real app. Tap around.</span>
        <button type="button" onClick={() => setKey((k) => k + 1)} className="font-semibold text-[var(--accent)] hover:underline">Start over</button>
        <a href="/app" target="_blank" rel="noopener" className="font-semibold text-[var(--accent)] hover:underline">Full screen</a>
      </figcaption>
    </figure>
  );
}
