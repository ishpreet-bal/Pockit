'use client';

import { useState } from 'react';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { StepTransition } from '@/components/ui/motion';
import { TRIAGE, recommendIntent, type Answers } from '@/lib/finance/budget-questions';
import { BUDGET_INTENTS, type BudgetIntent } from '@/lib/finance/budget-plan';
import { cn } from '@/lib/ui/cn';

/**
 * "I don't know what I'm trying to do."
 *
 * Three questions that pick a goal, with the reasoning shown rather than hidden.
 * The recommendation is deterministic — see `recommendIntent` — which matters for
 * two reasons: it works with no AI provider configured, which is this app's default
 * state, and the honest answer to "what should I focus on" really is a short
 * decision tree. Debt first, then a cash buffer, then everything else.
 *
 * The recommendation is never applied silently. It is shown with its reason and an
 * alternative, and the person chooses.
 */
export function Triage({
  onPick, onCancel, assistantAvailable,
}: {
  onPick: (intent: BudgetIntent) => void;
  onCancel: () => void;
  assistantAvailable: boolean;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);

  const done = TRIAGE.every((q) => answers[q.id]);
  const question = TRIAGE[index];

  function answer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    if (index < TRIAGE.length - 1) setIndex(index + 1);
  }

  if (done) {
    const rec = recommendIntent(answers);
    const label = BUDGET_INTENTS.find((i) => i.id === rec.intent)?.label ?? rec.intent;
    const altLabel = rec.alternative
      ? BUDGET_INTENTS.find((i) => i.id === rec.alternative!.intent)?.label
      : null;

    return (
      <div>
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] bg-[var(--accent-soft)] p-4">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={2.1} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Start with: {label}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{rec.because}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Button variant="primary" onClick={() => onPick(rec.intent)}>
            Use this
            <ArrowRight className="h-4 w-4" />
          </Button>
          {rec.alternative && altLabel ? (
            <Button onClick={() => onPick(rec.alternative!.intent)}>
              {rec.alternative.label} ({altLabel})
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => { setAnswers({}); setIndex(0); }}
            className="mt-1 text-xs font-medium text-[var(--accent)] hover:underline"
          >
            Answer again
          </button>
        </div>

        {assistantAvailable ? (
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
            Still unsure, or your situation does not fit any of these? The{' '}
            <a href="/assistant" className="font-medium text-[var(--accent)] hover:underline">assistant</a>{' '}
            can talk it through against your own records.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-subtle)]">
        Question {index + 1} of {TRIAGE.length}
      </p>

      <StepTransition stepKey={index} direction={1}>
        <h3 className="mt-1 text-lg font-semibold">{question?.prompt}</h3>
        <div role="radiogroup" aria-label={question?.prompt} className="mt-3 space-y-1.5">
          {(question?.choices ?? []).map((c) => {
            const on = answers[question!.id] === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => answer(question!.id, c.value)}
                className={cn(
                  'w-full rounded-[var(--radius-control)] border p-3 text-left text-sm transition-colors',
                  on
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium'
                    : 'border-[var(--border)] hover:bg-[var(--surface-2)]',
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </StepTransition>

      <div className="mt-4 flex gap-2">
        <Button
          className="flex-1"
          onClick={() => (index === 0 ? onCancel() : setIndex(index - 1))}
        >
          {index === 0 ? 'Back to the list' : 'Previous'}
        </Button>
      </div>

      <p className="mt-3 text-xs text-[var(--text-subtle)]">
        Nothing here is saved or shared. It only decides which questions to ask you next.
      </p>
    </div>
  );
}
