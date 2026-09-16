'use client';

/**
 * The last resort: an error thrown while rendering the root layout itself, where the
 * normal boundary cannot run because there is no layout left to render into. It has
 * to ship its own <html> and its own styles, so this deliberately uses inline styles
 * rather than the design tokens, which live in a stylesheet that may not have loaded.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fbfbfa', color: '#18181b' }}>
        <main style={{ maxWidth: 480, margin: '0 auto', padding: '4rem 1.25rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Pockit could not start</h1>
          <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: '#52525b' }}>
            This usually means the deployment has no database configured yet.
          </p>
          <p style={{ display: 'flex', gap: '0.5rem' }}>
            <a href="/setup" style={{ fontSize: '0.875rem' }}>Check setup</a>
            <button type="button" onClick={reset} style={{ fontSize: '0.875rem' }}>Try again</button>
          </p>
        </main>
      </body>
    </html>
  );
}
