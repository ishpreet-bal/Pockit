'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardBody, Button, Badge } from '@/components/ui/primitives';
import { AiConsentCard } from '@/components/brand/ai-consent';

interface ToolCall { name: string; input: Record<string, unknown>; drilldown: string | null }
interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  grounded?: boolean;
  error?: boolean;
}

const SUGGESTIONS = [
  'How much did I spend on food last month?',
  'What subscriptions am I paying for?',
  'Compare this month to last month',
  'Show all Amazon purchases over $100',
  'How much did I save over the last six months?',
  'Why were my expenses higher this month?',
];

const TOOL_LABELS: Record<string, string> = {
  get_spending_summary: 'Totalled your income and spending',
  get_spending_by_category: 'Grouped your spending by category',
  search_transactions: 'Searched your transactions',
  get_subscriptions: 'Found your recurring payments',
  get_accounts_and_net_worth: 'Read your account balances',
  get_goals: 'Checked your goals',
  compare_periods: 'Compared your recent months',
  get_top_merchants: 'Ranked your merchants',
};

export function AssistantChat({
  currency, providerLabel, aiEnabled,
}: { currency: string; providerLabel: string; aiEnabled: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Set when the server needs a yes before the AI may see anything: the question waits.
  const [consent, setConsent] = useState<{ provider: string | null; question: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    const history = messages.filter((m) => !m.error).slice(-8).map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, history }),
      });
      const body = (await res.json().catch(() => null)) as
        | { answer?: string; grounded?: boolean; toolCalls?: ToolCall[]; error?: string; needsAiConsent?: boolean; provider?: string | null } | null;

      if (body?.needsAiConsent) {
        setMessages((prev) => prev.slice(0, -1));
        setConsent({ provider: body.provider ?? null, question });
        return;
      }
      if (!res.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', content: body?.error ?? 'Something went wrong.', error: true }]);
        return;
      }
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: body?.answer ?? '',
        toolCalls: body?.toolCalls ?? [],
        grounded: body?.grounded ?? false,
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Could not reach the assistant.', error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4 sm:px-6">
      {messages.length === 0 ? (
        <Card>
          <CardBody className="pt-5">
            <p className="text-sm text-[var(--text-muted)]">
              Ask anything about your finances. Every figure in an answer comes from a query against your own
              records, and each answer shows which query produced it so you can open it and check.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s} type="button" onClick={() => void ask(s)} disabled={!aiEnabled}
                  className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-[var(--text-subtle)]">
              Processed by {providerLabel}. Only the query results needed to answer are sent — never your full
              transaction history. Amounts are in {currency}.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {consent ? (
        <AiConsentCard
          provider={consent.provider}
          onAllowed={() => { const q = consent.question; setConsent(null); void ask(q); }}
          onDeclined={() => setConsent(null)}
        />
      ) : null}

      {messages.map((message, i) => (
        <div key={i} className={message.role === 'user' ? 'flex justify-end' : ''}>
          {message.role === 'user' ? (
            <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--accent)] px-3.5 py-2 text-sm text-[var(--accent-fg)]">
              {message.content}
            </p>
          ) : (
            <Card className={message.error ? 'border-[var(--negative)]' : ''}>
              <CardBody className="pt-4">
                <p className={`whitespace-pre-wrap text-sm ${message.error ? 'text-[var(--negative)]' : ''}`}>
                  {message.content}
                </p>

                {message.toolCalls && message.toolCalls.length > 0 ? (
                  <div className="mt-3 border-t border-[var(--border)] pt-2.5">
                    <p className="text-2xs font-medium uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                      Where these figures came from
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {message.toolCalls.map((call, j) => (
                        <li key={j} className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--text-muted)]">
                          <span>{TOOL_LABELS[call.name] ?? call.name}</span>
                          {Object.keys(call.input).length > 0 ? (
                            <span className="text-[var(--text-subtle)]">
                              ({Object.entries(call.input).map(([k, v]) => `${k}: ${String(v)}`).join(', ')})
                            </span>
                          ) : null}
                          {call.drilldown ? (
                            <Link href={call.drilldown} className="font-medium text-[var(--accent)] hover:underline">
                              Open →
                            </Link>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* An answer produced without consulting the ledger is flagged, not hidden. */}
                {!message.error && message.grounded === false ? (
                  <p className="mt-2.5 flex items-center gap-1.5 text-xs">
                    <Badge tone="warning">Unverified</Badge>
                    <span className="text-[var(--text-subtle)]">
                      This answer was not based on a query against your records.
                    </span>
                  </p>
                ) : null}
              </CardBody>
            </Card>
          )}
        </div>
      ))}

      {busy ? (
        <Card>
          <CardBody className="flex items-center gap-2 pt-4 text-sm text-[var(--text-muted)]">
            <span className="inline-block h-3 w-3 animate-[pk-spin_0.8s_linear_infinite] rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            Querying your records…
          </CardBody>
        </Card>
      ) : null}

      <div ref={endRef} />

      <form
        onSubmit={(e) => { e.preventDefault(); void ask(input); }}
        className="sticky bottom-20 flex gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-2 lg:bottom-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your finances…"
          aria-label="Ask about your finances"
          disabled={busy || !aiEnabled}
          className="h-9 flex-1 bg-transparent px-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none"
        />
        <Button type="submit" variant="primary" disabled={busy || !input.trim() || !aiEnabled}>Ask</Button>
      </form>
    </div>
  );
}
