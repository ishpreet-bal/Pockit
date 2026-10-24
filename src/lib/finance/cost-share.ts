/**
 * Split expenses, worked out from what the person chose.
 *
 * Two kinds:
 *   split   — shared between `people`, you included. Your part is yours; the rest
 *             was other people's from the start, owed back or already squared up.
 *   covered — you paid for someone else entirely. If it is coming back, none of it
 *             is your spending; if it is not (a treat), all of it still is.
 *
 * Plain numbers in minor units, so the ledger and the screens agree to the cent.
 */
export type CostShareKind = 'split' | 'covered';

export interface CostShareChoice {
  kind: CostShareKind;
  /** Everyone sharing, you included. Required for a split. */
  people?: number | null;
  /** An uneven split: your part. Null or missing means an even split. */
  mineMinor?: bigint | null;
  expectBack: boolean;
}

export interface CostShareAmounts {
  /** What counts as your own spending. */
  mineMinor: bigint;
  /** What other people's part was. */
  othersMinor: bigint;
  /** Taken out of your spending (others' part, unless it was a treat). */
  excludedMinor: bigint;
  /** Each other person's part, on an even split. */
  eachMinor: bigint | null;
}

/**
 * @param totalMinor the purchase, as a positive magnitude in base currency.
 *
 * On an even split each other person's part is rounded down and the leftover
 * cents are yours: Pockit never says someone owes more than their share.
 */
export function shareAmounts(totalMinor: bigint, choice: CostShareChoice): CostShareAmounts {
  const total = totalMinor < 0n ? -totalMinor : totalMinor;

  if (choice.kind === 'covered') {
    return {
      mineMinor: choice.expectBack ? 0n : total,
      othersMinor: total,
      excludedMinor: choice.expectBack ? total : 0n,
      eachMinor: null,
    };
  }

  const people = BigInt(Math.max(2, Math.floor(choice.people ?? 2)));
  if (choice.mineMinor !== null && choice.mineMinor !== undefined) {
    const mine = choice.mineMinor < 0n ? 0n : choice.mineMinor > total ? total : choice.mineMinor;
    return { mineMinor: mine, othersMinor: total - mine, excludedMinor: total - mine, eachMinor: null };
  }
  const each = total / people;
  const others = each * (people - 1n);
  return { mineMinor: total - others, othersMinor: others, excludedMinor: others, eachMinor: each };
}

/** Still to come back: nothing unless it is expected, never below zero. */
export function owedMinor(amounts: CostShareAmounts, choice: Pick<CostShareChoice, 'expectBack'>, repaidMinor: bigint): bigint {
  if (!choice.expectBack) return 0n;
  const left = amounts.othersMinor - repaidMinor;
  return left > 0n ? left : 0n;
}

/** One line for a list: "Split 4 ways · your share $30" is built from this. */
export function describeShare(choice: CostShareChoice, withWhom?: string | null): string {
  const who = withWhom?.trim();
  if (choice.kind === 'covered') {
    const base = who ? `Paid for ${who}` : 'Paid for someone else';
    return choice.expectBack ? base : `${base} · my treat`;
  }
  const n = Math.max(2, Math.floor(choice.people ?? 2));
  return who ? `Split with ${who}` : `Split ${n} ways`;
}
