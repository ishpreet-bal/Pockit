/**
 * Credit card payments coming up: one honest line per card saying when it's due,
 * how much clears it, and the least you can pay without a late fee. Pure, tested.
 *
 * Card balances already count against what's safe to spend, so these are reminders,
 * not new bills: adding them to the runway would count the same money twice.
 */
export interface CardInput {
  id: string; name: string; mask: string | null; institution: string | null;
  balanceMinor: number | null;
  paymentDueDate: string | null; paymentDueDay: number | null;
  statementBalanceMinor: number | null; minimumPaymentMinor: number | null;
  lastPaymentDate: string | null; lastStatementDate: string | null;
}
export interface CardDue {
  id: string; name: string; mask: string | null;
  dueDate: string; daysLeft: number;
  statementMinor: number | null; minimumMinor: number | null;
  /** Paid since the last statement, as far as the bank says. */
  paid: boolean;
  /** Where the date came from: the bank's statement, or a day of the month someone typed. */
  source: 'statement' | 'day';
}

const DAY = 86_400_000;
const at = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The next date with this day of the month, today included; short months use their last day. */
export function nextDayOfMonth(today: string, day: number): string {
  let y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1;
  for (let i = 0; i < 2; i++) {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const candidate = iso(Date.UTC(y, m, Math.min(day, last)));
    if (candidate >= today) return candidate;
    m += 1; if (m > 11) { m = 0; y += 1; }
  }
  return today;
}

export function cardsDue(cards: CardInput[], today: string): CardDue[] {
  const out: CardDue[] = [];
  for (const c of cards) {
    let dueDate: string | null = null; let source: CardDue['source'] = 'statement';
    // A statement date in the past has been replaced by the next one; until the bank
    // says so, the same day next month is the honest guess.
    if (c.paymentDueDate && c.paymentDueDate >= today) dueDate = c.paymentDueDate;
    else if (c.paymentDueDate) { dueDate = nextDayOfMonth(today, Number(c.paymentDueDate.slice(8, 10))); source = 'day'; }
    else if (c.paymentDueDay) { dueDate = nextDayOfMonth(today, c.paymentDueDay); source = 'day'; }
    if (!dueDate) continue;
    const paid = Boolean(c.lastPaymentDate && c.lastStatementDate && c.lastPaymentDate >= c.lastStatementDate)
      || (c.statementBalanceMinor !== null && c.statementBalanceMinor <= 0);
    out.push({
      id: c.id, name: c.name, mask: c.mask, dueDate, daysLeft: Math.round((at(dueDate) - at(today)) / DAY),
      statementMinor: c.statementBalanceMinor ?? (source === 'day' ? c.balanceMinor : null),
      minimumMinor: c.minimumPaymentMinor, paid, source,
    });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
