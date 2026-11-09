'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Trash2, MessageSquare, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { Mascot } from './mascot';
import { cn } from '@/lib/ui/cn';
import { AiConsentCard } from './ai-consent';

interface Thread { id: string; title: string; symbol: string | null; updatedAt: string }
interface Message { id?: string; role: string; body: string }

/**
 * Openers, chosen to show both halves of what Pock can do: how the app works, and
 * what the person's own numbers say. A list of purely financial questions would
 * hide the half people actually get stuck on.
 */
const STARTERS = [
  'How do I create a budget?',
  'Why is my available monthly negative?',
  'Where did I spend the most this month?',
  'Where do I add recurring bills?',
];

/**
 * Confused? Ask Pock.
 *
 * Conversations persist, and old ones are listed, because the questions people have
 * about investing are the same ones six months apart — "what was that thing you told
 * me about bonds" is a real need, and an assistant that forgets every session cannot
 * meet it.
 *
 * `symbol` comes from the page it was opened on, so "is this expensive?" has a
 * subject without the person having to name it.
 */
export interface PockAnchor {
  kind: 'goal' | 'symbol' | 'budget' | 'spending';
  id?: string;
  label?: string;
}

export function AskPock({
  symbol, anchor, initialPrompt, onClose,
}: {
  symbol?: string;
  /** What the person was looking at when they asked. Sent with every turn. */
  anchor?: PockAnchor | null;
  initialPrompt?: string;
  onClose?: () => void;
}) {
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState(initialPrompt ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the server needs a yes before the AI may see anything: the question waits.
  const [consent, setConsent] = useState<{ provider: string | null; question: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { void loadThreads(); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  async function loadThreads() {
    try {
      const response = await fetch('/api/pock');
      if (response.ok) setThreads(((await response.json()) as { threads: Thread[] }).threads);
    } catch { /* the list is a convenience; asking still works without it */ }
  }

  async function openThread(id: string) {
    setThreadId(id);
    setView('chat');
    setError(null);
    try {
      const response = await fetch(`/api/pock?thread=${encodeURIComponent(id)}`);
      if (response.ok) setMessages(((await response.json()) as { messages: Message[] }).messages);
    } catch {
      setError('Could not load that conversation.');
    }
  }

  async function forget(id: string) {
    if (!window.confirm('Delete this conversation? It cannot be undone.')) return;
    await fetch(`/api/pock?thread=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
    if (id === threadId) { setThreadId(null); setMessages([]); }
    void loadThreads();
  }

  async function ask(question: string) {
    const text = question.trim();
    if (text === '' || busy) return;

    setDraft('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', body: text }]);
    setBusy(true);

    try {
      const response = await fetch('/api/pock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: text,
          threadId: threadId ?? undefined,
          symbol,
          anchor: anchor ?? undefined,
        }),
      });
      const json = (await response.json().catch(() => null)) as
        { answer?: string; threadId?: string; error?: string; needsAiConsent?: boolean; provider?: string | null } | null;

      if (json?.needsAiConsent) {
        // Take the question back off screen; it is asked again once allowed.
        setMessages((prev) => prev.slice(0, -1));
        setConsent({ provider: json.provider ?? null, question: text });
        return;
      }
      if (!response.ok || !json?.answer) {
        setError(json?.error ?? 'Pock could not answer just now.');
        // The question stays on screen — retyping it would be the second insult.
        return;
      }

      setThreadId(json.threadId ?? threadId);
      setMessages((prev) => [...prev, { role: 'assistant', body: json.answer! }]);
      void loadThreads();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (view === 'history') {
    return (
      <div className="flex h-full flex-col">
        <Header
          title="Past questions"
          left={<IconButton label="Back" onClick={() => setView('chat')}><ArrowLeft className="h-4 w-4" /></IconButton>}
          onClose={onClose}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {threads.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Nothing yet. What you ask is kept here.</p>
          ) : (
            <ul className="space-y-1">
              {threads.map((t) => (
                <li key={t.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void openThread(t.id)}
                    className="min-w-0 flex-1 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                  >
                    <span className="block truncate">{t.title}</span>
                    <span className="block text-2xs text-[var(--text-subtle)]">
                      {new Date(t.updatedAt).toLocaleDateString()}
                      {t.symbol ? ` · ${t.symbol}` : ''}
                    </span>
                  </button>
                  <IconButton label={`Delete ${t.title}`} onClick={() => void forget(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Ask Pock"
        left={<Mascot mood="idle" className="h-6 w-6 text-[var(--accent)]" />}
        right={
          <IconButton label="Past questions" onClick={() => setView('history')}>
            <MessageSquare className="h-4 w-4" />
          </IconButton>
        }
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <>
            <p className="text-sm text-[var(--text-muted)]">
              {anchor?.label
                ? `Ask anything about ${anchor.label}. Pock already knows which one you mean.`
                : 'Confused by something? Ask. Pock knows how Pockit works and can see your own numbers — and will say when it does not know rather than guessing.'}
            </p>
            <ul className="space-y-1.5">
              {STARTERS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void ask(s)}
                    className="w-full rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2 text-left text-sm hover:border-[var(--accent)] hover:bg-[var(--surface-2)]"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          messages.map((m, i) => (
            <div
              key={m.id ?? i}
              className={cn(
                'max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-card)] px-3 py-2 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'ml-auto bg-[var(--accent-soft)] text-[var(--text)]'
                  : 'bg-[var(--surface-2)]',
              )}
            >
              {m.body}
              {m.role === 'assistant' ? <ReportAnswer question={messages[i - 1]?.body ?? null} answer={m.body} /> : null}
            </div>
          ))
        )}

        {busy ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <span className="inline-block h-3 w-3 animate-[pk-spin_0.7s_linear_infinite] rounded-full border-2 border-current border-t-transparent" />
            Looking at your position…
          </p>
        ) : null}

        {consent ? (
          <AiConsentCard
            provider={consent.provider}
            onAllowed={() => { const q = consent.question; setConsent(null); void ask(q); }}
            onDeclined={() => setConsent(null)}
          />
        ) : null}
        {error ? (
          <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">
            {error}
          </p>
        ) : null}

        <div ref={bottom} />
      </div>

      <div className="border-t border-[var(--border)] p-2.5">
        <div className="flex items-end gap-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter makes a new line — the convention people
              // already have from every other message box.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(draft); }
            }}
            rows={1}
            maxLength={2000}
            placeholder={
              anchor?.label ? `Ask about ${anchor.label}…`
                : symbol ? `Ask about ${symbol}…`
                : 'Ask anything…'
            }
            className="max-h-28 min-h-[38px] w-full min-w-0 resize-y rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none"
          />
          <Button
            variant="primary" size="sm" aria-label="Send"
            disabled={busy || draft.trim() === ''}
            onClick={() => void ask(draft)}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="mt-1.5 text-2xs text-[var(--text-subtle)]">
          Guidance, not financial advice. Pock never tells you what to buy or sell.
        </p>
      </div>
    </div>
  );
}

function Header({
  title, left, right, onClose,
}: { title: string; left?: React.ReactNode; right?: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
      {left}
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
      {right}
      {onClose ? <IconButton label="Close" onClick={onClose}>×</IconButton> : null}
    </div>
  );
}

function IconButton({
  label, onClick, children,
}: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-control)] text-[var(--text-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    >
      {children}
    </button>
  );
}

/** A person reviews reported answers: AI can be wrong, and money answers matter. */
function ReportAnswer({ question, answer }: { question: string | null; answer: string }) {
  const [done, setDone] = useState(false);
  async function report() {
    setDone(true);
    await fetch('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'bug', page: 'pock-answer', message: `Reported Pock answer.\n\nQuestion: ${question ?? '(unknown)'}\n\nAnswer: ${answer}`.slice(0, 4000) }),
    }).catch(() => null);
  }
  return (
    <button type="button" onClick={() => void report()} disabled={done}
      className="mt-1.5 block text-xs text-[var(--text-subtle)] hover:underline disabled:no-underline">
      {done ? 'Reported. Thank you.' : 'Wrong or unhelpful? Report'}
    </button>
  );
}

