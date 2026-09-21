import { Sparkles, FileSearch } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { analyseAsset } from '@/lib/market/analysis';

/**
 * The written analysis, and — just as importantly — the evidence it was given.
 *
 * The fact sheet is shown in full beneath the narrative rather than hidden, so any
 * sentence can be checked against the figures behind it. An analysis you cannot
 * audit is just confident prose.
 */
export async function AiAnalysis({ symbol }: { symbol: string }) {
  const analysis = await analyseAsset(symbol);

  return (
    <Card>
      <CardHeader
        title="Analysis"
        description={
          analysis.available
            ? `Generated ${new Date(analysis.generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · ${analysis.engine}`
            : analysis.engine
        }
      />
      <CardBody>
        {analysis.gaps.length > 0 ? (
          <div className="mb-4 rounded-[var(--radius-control)] bg-[var(--warning-soft)] px-3.5 py-2.5">
            <p className="text-xs font-semibold text-[var(--warning)]">What is missing</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-[var(--text-muted)]">
              {analysis.gaps.map((g) => <li key={g}>{g}</li>)}
            </ul>
          </div>
        ) : null}

        {analysis.available ? (
          <div className="space-y-4">
            {analysis.sections.map((s) => (
              <section key={s.id}>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.2} />
                  {s.title}
                </h3>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[var(--text-muted)]">{s.body}</p>
              </section>
            ))}
            <p className="border-t border-[var(--border)] pt-3 text-2xs leading-relaxed text-[var(--text-subtle)]">
              Written by a language model from the figures listed below, and from nothing else. It is
              general information, not financial advice, and it does not know your circumstances.
              Check anything you intend to act on.
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Written analysis needs an AI provider key. The figures on this page are real and do not —
            everything else here works without it.
          </p>
        )}

        <details className="mt-4 border-t border-[var(--border)] pt-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
            <FileSearch className="h-3.5 w-3.5" />
            The {analysis.facts.length} facts this was based on
          </summary>
          <dl className="mt-2.5 space-y-1.5">
            {analysis.facts.map((f, i) => (
              <div key={`${f.label}-${i}`} className="flex flex-wrap gap-x-2 text-xs">
                <dt className="text-[var(--text-subtle)]">{f.label}:</dt>
                <dd className="font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </CardBody>
    </Card>
  );
}
