import 'server-only';
import { eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { holdings, watchlistItems, investorProfiles, accounts } from '@/lib/db/schema';
import { marketData, catalogEntry, searchCatalog } from '@/lib/market';
import { formatMoney } from '@/lib/money';

/**
 * What Pock is allowed to know, and what it is forbidden to do.
 *
 * The brief is the whole safety model of this feature, so it is written as rules
 * rather than as a personality. The single most damaging thing a friendly assistant
 * inside a finance app can do is give confident personal advice — "yes, buy it" —
 * and be wrong, to someone who asked precisely because they did not know.
 */
export const POCK_BRIEF = `You are Pock, the guide inside Pockit, a personal finance app.
Someone has asked you a question about investing. Answer it in plain language, the way
a patient friend who happens to know this subject would — not like a brochure and not
like a disclaimer.

WHAT YOU ARE GIVEN
Below the question you will find a FACTS section. It contains this person's actual
position and any market figures the app has fetched just now. That is the only
source of numbers you may use.

HARD RULES, in order of importance:
1. Never tell someone to buy, sell or hold a specific investment. Not as a
   suggestion, not as "if it were me", not hedged. Explain how the decision works
   and what it depends on, and let them make it.
2. Never state a market figure that is not in FACTS. No prices, no returns, no
   market caps, no earnings dates from memory. If a number would help and is not
   there, say which number you would want and where it comes from.
3. Never predict a price or a direction. You may explain what would have to be true
   for an outcome, framed as reasoning rather than forecast.
4. Separate what is measured from what is interpretation. If you are reasoning
   rather than reporting, the sentence should make that obvious.
5. If the person appears to be in a situation where investing is the wrong next step
   — high-interest debt, no cash buffer, money needed within about three years —
   say so plainly, even if that is not what they asked.
6. If you do not know, say you do not know.

STYLE
Short paragraphs. No headings unless the answer genuinely has parts. No bullet lists
of more than four items. Define a term the first time you use it, in half a sentence,
without being condescending. Address them as "you". Never use the word "simply".
Around 150 words unless the question truly needs more.`;

export interface PockContext {
  factSheet: string;
  /** The facts given, stored alongside the answer so a claim can be audited later. */
  facts: Record<string, unknown>;
  symbols: string[];
}

/**
 * Build the facts for one question.
 *
 * Pulls the person's real position, then looks up any instrument the question
 * appears to be about. Mentioning a symbol is what triggers a market lookup — asking
 * "what is an ETF" should not spend an API call, and asking "is VOO expensive"
 * should not be answered from memory.
 */
export async function buildContext(
  tx: Db,
  workspaceId: string,
  question: string,
  hintSymbol?: string | null,
): Promise<PockContext> {
  const [holdingRows, watchRows, profileRows, accountRows] = await Promise.all([
    tx.select().from(holdings).where(eq(holdings.workspaceId, workspaceId)),
    tx.select().from(watchlistItems).where(eq(watchlistItems.workspaceId, workspaceId)),
    tx.select().from(investorProfiles).where(eq(investorProfiles.workspaceId, workspaceId)).limit(1),
    tx.select().from(accounts).where(eq(accounts.workspaceId, workspaceId)),
  ]);

  const symbols = detectSymbols(question, hintSymbol, [
    ...holdingRows.map((h) => h.symbol).filter((s): s is string => Boolean(s)),
    ...watchRows.map((w) => w.symbol),
  ]);

  const source = marketData();
  const quotes = symbols.length > 0 ? await source.quotes(symbols) : new Map();

  const lines: string[] = [];
  const facts: Record<string, unknown> = {};

  const profile = profileRows[0];
  if (profile) {
    lines.push(`Their risk questionnaire result: ${profile.level}.`);
    if (profile.stocksPct != null) {
      lines.push(`The mix it suggested: ${profile.stocksPct}% stocks, ${profile.bondsPct ?? 0}% bonds, ${profile.cashPct ?? 0}% cash.`);
    }
    facts.profileLevel = profile.level;
  } else {
    lines.push('They have not completed the risk questionnaire, so their situation is unknown. Do not assume one.');
  }

  if (holdingRows.length === 0) {
    lines.push('They hold no investments recorded in this app.');
  } else {
    lines.push(`They hold ${holdingRows.length} investment${holdingRows.length === 1 ? '' : 's'}:`);
    for (const h of holdingRows) {
      const symbol = h.symbol ?? 'unnamed';
      lines.push(`- ${symbol}: ${h.quantity} units, cost ${minor(h.costBasisMinor)}, last recorded value ${minor(h.currentValueMinor)}.`);
    }
    facts.holdings = holdingRows.length;
  }

  // Whether debt exists decides whether investing is the right question at all, so
  // it is included even when the question is about an instrument.
  //
  // Names and types only, deliberately. A balance is derived from the whole
  // transaction ledger, and pulling that for a chat message would be both slow and
  // a much larger slice of someone's data than the question asked for. Pock can
  // raise the debt question from its existence; it does not need the figure, and a
  // figure it cannot verify is worse than none.
  const debts = accountRows.filter(
    (a) => a.type === 'credit_card' || a.type === 'loan' || a.type === 'line_of_credit',
  );
  if (debts.length > 0) {
    lines.push(
      `They have ${debts.length} debt account${debts.length === 1 ? '' : 's'} recorded ` +
      `(${debts.map((d) => `${d.name}, a ${d.type.replace(/_/g, ' ')}`).join('; ')}). ` +
      'Balances were not fetched, so do not state or guess one.',
    );
    facts.debtAccounts = debts.length;
  }

  if (watchRows.length > 0) {
    lines.push(`They are following: ${watchRows.map((w) => w.symbol).join(', ')}.`);
  }

  if (symbols.length > 0) {
    lines.push('');
    lines.push('Market figures fetched just now:');
    for (const symbol of symbols) {
      const quote = quotes.get(symbol.toUpperCase());
      const entry = catalogEntry(symbol);
      if (!quote) {
        lines.push(`- ${symbol}: no price available right now. Say so rather than estimating.`);
        continue;
      }
      const label = entry?.name ? `${symbol} (${entry.name})` : symbol;
      const change = quote.changeBps === null ? 'change unknown' : `${(quote.changeBps / 100).toFixed(2)}% today`;
      const flag = quote.simulated ? ' [SAMPLE DATA, NOT A REAL MARKET — say so if you cite it]' : '';
      lines.push(`- ${label}: ${formatMoney(quote.priceMinor, quote.currency)}, ${change}, as of ${quote.asOf}${flag}`);
      facts[`quote:${symbol}`] = {
        priceMinor: Number(quote.priceMinor),
        currency: quote.currency,
        changeBps: quote.changeBps,
        asOf: quote.asOf,
        simulated: quote.simulated,
      };
    }
  } else {
    lines.push('');
    lines.push('No specific instrument was identified in the question, so no market figures were fetched. Do not supply any.');
  }

  return { factSheet: `FACTS\n${lines.join('\n')}`, facts, symbols };
}

/** bigint columns arrive as strings from the driver; never as floats. */
function minor(value: unknown): string {
  try {
    return formatMoney(BigInt(value as string), 'USD');
  } catch {
    return 'unknown';
  }
}

/**
 * Which instruments is this question about?
 *
 * Three passes, cheapest first: an explicit hint from the page they asked from,
 * then anything that looks like a ticker they already hold or follow, then the
 * curated catalogue by name. Kept to four so one rambling question cannot spend a
 * day's API quota.
 */
function detectSymbols(question: string, hint: string | null | undefined, known: string[]): string[] {
  const found = new Set<string>();
  if (hint) found.add(hint.toUpperCase());

  const upper = question.toUpperCase();
  for (const symbol of known) {
    if (new RegExp(`\\b${escapeRegex(symbol.toUpperCase())}\\b`).test(upper)) found.add(symbol.toUpperCase());
  }

  // Bare capitalised words that are real catalogue symbols. Checked against the
  // catalogue rather than accepted on shape, so "I" and "A" in normal prose do not
  // become lookups.
  for (const candidate of question.match(/\b[A-Za-z]{2,5}\b/g) ?? []) {
    if (found.size >= 4) break;
    const entry = catalogEntry(candidate.toUpperCase());
    if (entry && candidate === candidate.toUpperCase()) found.add(entry.symbol);
  }

  if (found.size === 0) {
    // Last resort: a company or fund named in words rather than by ticker.
    const hits = searchCatalog(question, 2);
    for (const hit of hits) if (hit.score >= 0.8) found.add(hit.symbol);
  }

  return [...found].slice(0, 4);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
