import { useIsDark } from './tokens';

/**
 * The friendly colours: six, one per kind of spending, so Groceries is always
 * green and Eating out always coral wherever they appear. Picked and checked
 * with a colour-vision validator so neighbouring colours stay distinguishable
 * for colourblind people too, on navy and on paper. Charts show the top six
 * and fold the rest into a neutral "Other".
 *
 * Slots: 0 rose · 1 sun · 2 sky · 3 coral · 4 lilac · 5 mint
 */
const DARK = ['#c94a8f', '#b78e00', '#1c91ef', '#dd5540', '#a66eef', '#00a676'];
const LIGHT = ['#c23881', '#d09b00', '#22a7f6', '#f67255', '#885edc', '#009251'];
export const OTHER = { dark: '#5b6787', light: '#a39d8e' };

const NAMED: Record<string, number> = {
  groceries: 5, food: 5, health: 5, medical: 5, pharmacy: 5, fitness: 5, gym: 5,
  restaurants: 3, 'eating out': 3, takeaway: 3, entertainment: 3, events: 3,
  transportation: 2, transport: 2, gas: 2, transit: 2, parking: 2, travel: 2,
  housing: 4, rent: 4, 'rent or mortgage': 4, education: 4, 'debt payments': 4,
  bills: 1, utilities: 1, phone: 1, internet: 1, coffee: 1,
  shopping: 0, clothing: 0, subscriptions: 0, 'gifts & giving': 0, electronics: 0,
};

function index(key: string): number {
  const k = key.trim().toLowerCase();
  if (k in NAMED) return NAMED[k]!;
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return h % DARK.length;
}

/** A stable colour for a category (or goal, or anything with a name). */
export function useTint() {
  const dark = useIsDark();
  const list = dark ? DARK : LIGHT;
  return (key: string | null | undefined) => list[index(key ?? 'other')]!;
}

/** The same colour, faint — for the round tile behind an icon. */
export const soft = (hex: string, dark: boolean) => `${hex}${dark ? '26' : '22'}`;

/** Fixed colours for the shortcut doors, so each tool is recognisable at a glance. */
export const TOOL = { add: 3, bills: 2, budget: 5, trip: 4, purchases: 1, lessons: 4, ask: 3, lookup: 2 } as const;
export function useToolTint() {
  const dark = useIsDark();
  const list = dark ? DARK : LIGHT;
  return (tool: keyof typeof TOOL) => list[TOOL[tool]]!;
}

/**
 * Colours for one chart: each category keeps its own colour where it can, and
 * two categories that would share a colour get different ones — a chart never
 * shows two series in the same colour. Anything past six is "Other".
 */
export function useChartTints() {
  const dark = useIsDark();
  const list = dark ? DARK : LIGHT;
  return (names: string[]) => {
    const used = new Set<number>();
    const out = new Map<string, string>();
    for (const n of names) {
      let i = index(n);
      if (used.size >= list.length) { out.set(n, dark ? OTHER.dark : OTHER.light); continue; }
      while (used.has(i)) i = (i + 1) % list.length;
      used.add(i); out.set(n, list[i]!);
    }
    return out;
  };
}
