import { useIsDark } from './tokens';

/**
 * The friendly colours: one per category, so Groceries is always green and
 * Eating out always coral, wherever they appear. Bright enough to cheer the page
 * up, soft enough to sit on warm black (and a little deeper on paper).
 */
const DARK = ['#ff8a65', '#ffc75a', '#6fdc9a', '#5ec8f2', '#a98bff', '#ff7fb6', '#4fd1c5', '#c4e26a', '#f2a65a', '#8fa8ff'];
const LIGHT = ['#e8603c', '#d99a12', '#2fa866', '#1f97c9', '#7a5cf0', '#e0508f', '#14998d', '#7fa21c', '#c97a26', '#4e6ee8'];

const NAMED: Record<string, number> = {
  groceries: 2, food: 2, restaurants: 0, 'eating out': 0, takeaway: 0, coffee: 8,
  transportation: 3, transport: 3, gas: 3, transit: 3, parking: 3,
  housing: 4, rent: 4, 'rent or mortgage': 4, bills: 1, utilities: 1, phone: 1, internet: 1, subscriptions: 5,
  shopping: 5, clothing: 5, electronics: 9, entertainment: 6, travel: 6, health: 7, medical: 7, fitness: 7, gym: 7,
  education: 9, 'debt payments': 9, 'gifts & giving': 5, other: 9,
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
export const TOOL = { add: 0, bills: 3, budget: 2, trip: 4, purchases: 1, lessons: 6, ask: 0, lookup: 3 } as const;
export function useToolTint() {
  const dark = useIsDark();
  const list = dark ? DARK : LIGHT;
  return (tool: keyof typeof TOOL) => list[TOOL[tool]]!;
}
