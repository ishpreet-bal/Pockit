'use client';

import { Input } from '@/components/ui/primitives';
import type { Answers, Question } from '@/lib/finance/budget-questions';
import { cn } from '@/lib/ui/cn';

/**
 * Renders the questions a particular goal needs.
 *
 * One component for every branch rather than a bespoke form per intent: the
 * questions differ, the way they are asked does not. That also means adding a
 * question is a data change in `budget-questions.ts`, with no UI work at all.
 */
export function TailoredQuestions({
  questions, answers, onChange, currency,
}: {
  questions: Question[];
  answers: Answers;
  onChange: (id: string, value: string) => void;
  currency: string;
}) {
  return (
    <div className="space-y-6">
      {questions.map((q) => (
        <div key={q.id}>
          <label
            className="block text-sm font-semibold"
            htmlFor={q.kind === 'choice' ? undefined : `q-${q.id}`}
          >
            {q.prompt}
            {q.optional ? (
              <span className="ml-1.5 text-xs font-normal text-[var(--text-subtle)]">optional</span>
            ) : null}
          </label>
          {q.help ? (
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{q.help}</p>
          ) : null}

          {q.kind === 'choice' ? (
            <div role="radiogroup" aria-label={q.prompt} className="mt-2.5 space-y-1.5">
              {(q.choices ?? []).map((c) => {
                const on = answers[q.id] === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChange(q.id, c.value)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-[var(--radius-control)] border p-3 text-left transition-colors',
                      on
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border)] hover:bg-[var(--surface-2)]',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2',
                        on ? 'border-[var(--accent)]' : 'border-[var(--border-strong)]',
                      )}
                    >
                      {on ? <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{c.label}</span>
                      {c.blurb ? (
                        <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{c.blurb}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="relative mt-2">
              {q.kind === 'money' ? (
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-subtle)]">
                  {currencySymbol(currency)}
                </span>
              ) : null}
              <Input
                id={`q-${q.id}`}
                inputMode={q.kind === 'money' ? 'decimal' : undefined}
                value={answers[q.id] ?? ''}
                onChange={(e) => onChange(q.id, e.target.value)}
                placeholder={q.placeholder}
                className={cn('h-12 text-lg', q.kind === 'money' && 'pl-7')}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The currency's symbol on its own, for use as an input prefix.
 *
 * Derived from Intl rather than a lookup table so it is right for every currency
 * the app supports, including the ones where the symbol is not a dollar sign.
 */
function currencySymbol(currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? '';
  } catch {
    return '';
  }
}
