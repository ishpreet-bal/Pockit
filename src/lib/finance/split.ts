/**
 * Splitting a shared space's spending evenly: who paid what, each person's fair
 * share, and the fewest payments that square everyone up.
 */
export interface Member { id: string; name: string }
export interface SplitResult {
  totalMinor: number;
  shareMinor: number;
  people: { id: string; name: string; paidMinor: number; balanceMinor: number }[]; // + = is owed money
  settle: { from: string; to: string; amountMinor: number }[];
}

export function splitEvenly(members: Member[], paid: Map<string, number>): SplitResult {
  const total = members.reduce((s, m) => s + (paid.get(m.id) ?? 0), 0);
  const n = Math.max(1, members.length);
  const share = Math.round(total / n);
  const people = members.map((m) => ({ id: m.id, name: m.name, paidMinor: paid.get(m.id) ?? 0, balanceMinor: (paid.get(m.id) ?? 0) - share }));

  // Largest debtor pays largest creditor until everyone's within a dollar.
  const owe = people.filter((p) => p.balanceMinor < -50).map((p) => ({ name: p.name, left: -p.balanceMinor })).sort((a, b) => b.left - a.left);
  const owed = people.filter((p) => p.balanceMinor > 50).map((p) => ({ name: p.name, left: p.balanceMinor })).sort((a, b) => b.left - a.left);
  const settle: SplitResult['settle'] = [];
  let i = 0, j = 0;
  while (i < owe.length && j < owed.length) {
    const amt = Math.min(owe[i]!.left, owed[j]!.left);
    if (amt >= 50) settle.push({ from: owe[i]!.name, to: owed[j]!.name, amountMinor: amt });
    owe[i]!.left -= amt; owed[j]!.left -= amt;
    if (owe[i]!.left < 50) i++;
    if (owed[j]!.left < 50) j++;
  }
  return { totalMinor: total, shareMinor: share, people, settle };
}
