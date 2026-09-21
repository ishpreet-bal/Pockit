import 'server-only';
import { marketData, catalogEntry } from './index';
import type { AssetProfile, Fundamentals, History, NewsItem, Quote } from './types';

/**
 * Grounded analysis of one instrument.
 *
 * The rule that shapes everything here: the model is given ONLY figures this app has
 * actually fetched, and is told to work from them. It is not asked what it knows
 * about a company — that is how you get confident, dated, unverifiable claims about
 * earnings that never happened.
 *
 * Consequences of that rule, deliberately accepted:
 *  - With no market-data key there are no fundamentals and no news, so there is
 *    little to analyse, and the section says so instead of filling the space.
 *  - With no AI key there is no narrative at all. The structured facts are still
 *    shown, because those are real.
 *
 * Every section separates what was measured from what is being inferred, and the
 * facts it was given are listed alongside the output so any claim can be checked.
 */

export type AnalysisSectionId =
  | 'snapshot' | 'strengths' | 'risks' | 'valuation' | 'developments' | 'longterm' | 'scenarios';

export interface AnalysisSection {
  id: AnalysisSectionId;
  title: string;
  body: string;
}

export interface Analysis {
  symbol: string;
  generatedAt: string;
  /** Which model, or the reason there is no narrative. */
  engine: string;
  sections: AnalysisSection[];
  /** The exact figures handed to the model, so the reader can audit it. */
  facts: { label: string; value: string }[];
  /** What was NOT available, stated rather than silently omitted. */
  gaps: string[];
  available: boolean;
}

interface Evidence {
  profile: AssetProfile | null;
  quote: Quote | null;
  fundamentals: Fundamentals | null;
  history: History | null;
  news: NewsItem[];
}

export async function analyseAsset(symbol: string): Promise<Analysis> {
  const source = marketData();
  const [profile, quote, fundamentals, history, news] = await Promise.all([
    source.profile(symbol),
    source.quote(symbol),
    source.fundamentals(symbol),
    source.history(symbol, '1Y'),
    source.news(symbol, 5),
  ]);

  const evidence: Evidence = { profile, quote, fundamentals, history, news };
  const facts = describeFacts(symbol, evidence, source.live);
  const gaps = describeGaps(evidence, source.live);

  const { getAiProvider } = await import('@/lib/ai');
  const provider = getAiProvider();

  if (!provider.capabilities.tools) {
    return {
      symbol,
      generatedAt: new Date().toISOString(),
      engine: 'No AI provider configured',
      sections: [],
      facts,
      gaps,
      available: false,
    };
  }

  // Deliberately not implemented as a free-form prompt: the model gets a fact sheet
  // and a strict brief, and anything it cannot support from that sheet it must say
  // it cannot support.
  const sections = await requestNarrative(provider, symbol, facts, gaps, evidence);

  return {
    symbol,
    generatedAt: new Date().toISOString(),
    engine: provider.capabilities.label,
    sections,
    facts,
    gaps,
    available: sections.length > 0,
  };
}

function describeFacts(symbol: string, e: Evidence, live: boolean): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  const entry = catalogEntry(symbol);

  facts.push({ label: 'Instrument', value: `${symbol} — ${e.profile?.name ?? entry?.name ?? 'unknown'}` });
  facts.push({ label: 'Type', value: e.profile?.kind ?? entry?.kind ?? 'unknown' });
  if (e.profile?.sector) facts.push({ label: 'Sector', value: e.profile.sector });
  if (e.profile?.tracks) facts.push({ label: 'Tracks', value: e.profile.tracks });
  if (e.profile?.expenseRatioBps != null) {
    facts.push({ label: 'Expense ratio (indicative)', value: `${(e.profile.expenseRatioBps / 100).toFixed(2)}% a year` });
  }

  if (e.quote) {
    facts.push({
      label: 'Price',
      value: `${(Number(e.quote.priceMinor) / 100).toFixed(2)} ${e.quote.currency}` +
        (e.quote.simulated ? ' (SAMPLE DATA, not a real market)' : ''),
    });
    if (e.quote.changeBps !== null) {
      facts.push({ label: 'Change today', value: `${(e.quote.changeBps / 100).toFixed(2)}%` });
    }
  }

  if (e.history && e.history.candles.length > 1) {
    const first = Number(e.history.candles[0]!.closeMinor);
    const last = Number(e.history.candles[e.history.candles.length - 1]!.closeMinor);
    const pct = ((last - first) / first) * 100;
    facts.push({
      label: 'Change over the last year',
      value: `${pct.toFixed(1)}%${e.history.simulated ? ' (SAMPLE DATA)' : ''}`,
    });
  }

  const f = e.fundamentals;
  if (f) {
    if (f.marketCapMinor) facts.push({ label: 'Market cap', value: `${(Number(f.marketCapMinor) / 100).toLocaleString()} ${f.currency}` });
    if (f.peRatio) facts.push({ label: 'P/E (trailing)', value: f.peRatio.toFixed(1) });
    if (f.epsMinor) facts.push({ label: 'EPS (trailing)', value: `${(Number(f.epsMinor) / 100).toFixed(2)} ${f.currency}` });
    if (f.profitMarginPct !== null) facts.push({ label: 'Net profit margin', value: `${f.profitMarginPct.toFixed(1)}%` });
    if (f.dividendYieldBps) facts.push({ label: 'Dividend yield', value: `${(f.dividendYieldBps / 100).toFixed(2)}%` });
    if (f.beta) facts.push({ label: 'Beta', value: f.beta.toFixed(2) });
    if (f.week52LowMinor && f.week52HighMinor) {
      facts.push({
        label: '52-week range',
        value: `${(Number(f.week52LowMinor) / 100).toFixed(2)} – ${(Number(f.week52HighMinor) / 100).toFixed(2)} ${f.currency}`,
      });
    }
  }

  for (const n of e.news.slice(0, 5)) {
    facts.push({ label: `News (${new Date(n.publishedAt).toISOString().slice(0, 10)}, ${n.source})`, value: n.headline });
  }

  if (!live) {
    facts.push({
      label: 'Data source',
      value: 'SAMPLE DATA — no market-data key is connected. Prices and history are illustrative, not real.',
    });
  }

  return facts;
}

function describeGaps(e: Evidence, live: boolean): string[] {
  const gaps: string[] = [];
  if (!live) gaps.push('No live market data: prices and history below are sample figures, not a real market.');
  if (!e.fundamentals) gaps.push('No fundamentals (market cap, P/E, margins) are available from the connected source.');
  if (e.news.length === 0) gaps.push('No recent news is available, so nothing here reflects current events.');
  if (!e.history) gaps.push('No price history is available, so longer-term performance cannot be assessed.');
  return gaps;
}

const BRIEF = `You are writing a research note for a personal finance app. You will be given a FACT SHEET.

Absolute rules:
- Use ONLY the facts provided. Do not add figures, dates, products, executives, earnings or events from memory.
- If the fact sheet says data is SAMPLE DATA, do not draw conclusions from those numbers; say plainly that real data is needed.
- Never recommend buying, selling or holding. Never predict a price.
- Where you interpret rather than report, say so ("this suggests", "one reading is").
- If a section cannot be supported by the facts, write one sentence saying what is missing instead of speculating.
- Plain language. No jargon without explaining it. British spelling.

Return JSON: {"sections":[{"id":"snapshot","body":"..."},...]}
Section ids, in order: snapshot, strengths, risks, valuation, developments, longterm, scenarios.
- snapshot: what this instrument is and what the given data shows.
- strengths: what the provided numbers support as positives. If none can be supported, say so.
- risks: what the provided numbers, and the nature of the instrument, suggest as risks.
- valuation: what the valuation figures mean, if present. If absent, say they are absent.
- developments: only from the supplied news items, with their dates. If none, say so.
- longterm: what would matter over years for an instrument of this type.
- scenarios: conditions that would support a better outcome, a middling one, and a worse one. Conditions, not predictions.`;

const TITLES: Record<AnalysisSectionId, string> = {
  snapshot: 'Snapshot',
  strengths: 'Strengths',
  risks: 'Risks',
  valuation: 'Valuation context',
  developments: 'Recent developments',
  longterm: 'Long-term considerations',
  scenarios: 'What would have to be true',
};

async function requestNarrative(
  provider: Awaited<ReturnType<typeof import('@/lib/ai')['getAiProvider']>>,
  symbol: string,
  facts: { label: string; value: string }[],
  gaps: string[],
  _evidence: Evidence,
): Promise<AnalysisSection[]> {
  const factSheet = facts.map((f) => `- ${f.label}: ${f.value}`).join('\n');
  const missing = gaps.length > 0 ? `\n\nNOT AVAILABLE:\n${gaps.map((g) => `- ${g}`).join('\n')}` : '';

  try {
    const { data: text } = await provider.research({
      brief: BRIEF,
      factSheet: `FACT SHEET for ${symbol}:\n${factSheet}${missing}`,
      maxTokens: 1600,
    });

    const parsed = JSON.parse(extractJson(text)) as { sections?: { id?: string; body?: string }[] };
    return (parsed.sections ?? [])
      .filter((s): s is { id: AnalysisSectionId; body: string } =>
        typeof s.id === 'string' && s.id in TITLES && typeof s.body === 'string' && s.body.trim() !== '')
      .map((s) => ({ id: s.id, title: TITLES[s.id], body: s.body.trim() }));
  } catch {
    // A malformed or failed response yields no narrative rather than a partial one
    // that might read as authoritative.
    return [];
  }
}

/** Pulls the JSON object out of a response that may be fenced or prefaced. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}
