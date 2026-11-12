import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AssistantToolDefinition } from './types';

/**
 * Things Pock can do for you, not just tell you.
 *
 * Pock never changes anything itself. Each tool here checks what the model asked
 * for, resolves names to the real category or card, and returns a PROPOSAL: a card
 * in the chat with "Do it" and "Not now". Only the person's tap runs it, through
 * POST /api/pock/act, which goes through the same endpoints as doing it by hand.
 * So a confused or manipulated model can, at worst, suggest something you decline.
 */

export const SCREENS = {
  home: { path: '/', label: 'Home' },
  spending: { path: '/transactions', label: 'Spending' },
  budget: { path: '/budget', label: 'Budget' },
  bills: { path: '/bills', label: 'Bills & income' },
  goals: { path: '/goals', label: 'Goals' },
  accounts: { path: '/accounts', label: 'Accounts' },
  together: { path: '/together', label: 'Together' },
  trends: { path: '/trends', label: 'Trends' },
  trip: { path: '/trip', label: 'Plan a trip' },
  settings: { path: '/settings', label: 'Settings' },
} as const;
export type Screen = keyof typeof SCREENS;

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().positive().max(1_000_000);

/** What each action needs, in the form the act endpoint re-checks. Never trusted from the model alone. */
export const ACTION_PARAMS = {
  add_purchase: z.object({ amount: money, description: z.string().trim().min(1).max(120), date: iso, categoryId: z.string().uuid().nullable(), accountId: z.string().uuid(), income: z.boolean().default(false) }),
  add_bill: z.object({ name: z.string().trim().min(1).max(80), amount: money, dayOfMonth: z.number().int().min(1).max(31), categoryId: z.string().uuid().nullable() }),
  create_goal: z.object({ name: z.string().trim().min(1).max(80), target: money, targetDate: iso.nullable() }),
  set_budget: z.object({ categoryId: z.string().uuid(), categoryName: z.string().max(80), amount: z.number().min(0).max(1_000_000) }),
  set_card_due_day: z.object({ accountId: z.string().uuid(), day: z.number().int().min(1).max(31) }),
  open_screen: z.object({ screen: z.enum(Object.keys(SCREENS) as [Screen, ...Screen[]]) }),
} as const;
export type ActionKind = keyof typeof ACTION_PARAMS;

export interface Proposal {
  id: string;
  kind: ActionKind;
  /** What the card says, in plain words: "Add $14.50 at Tim Hortons". */
  title: string;
  detail: string | null;
  /** The button: "Add it", "Open Bills". */
  confirm: string;
  params: Record<string, unknown>;
}

interface Ctx {
  today: string;
  currency: string;
  categories: { id: string; name: string; kind: string }[];
  accounts: { id: string; name: string; type: string }[];
}

const fmt = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function findByName<T extends { name: string }>(list: T[], wanted: string | null | undefined): T | null {
  if (!wanted) return null;
  const w = norm(wanted);
  if (!w) return null;
  return list.find((x) => norm(x.name) === w)
    ?? list.find((x) => norm(x.name).startsWith(w) || w.startsWith(norm(x.name)))
    ?? list.find((x) => norm(x.name).includes(w))
    ?? null;
}

const NOT_DONE = 'Shown to the person as a card with a button. NOTHING HAS CHANGED YET: it happens only if they tap it. In your reply, say in one short line what the card will do; never say it is done.';

/**
 * The action tools, plus the list they fill. Call once per question; read
 * `proposals` after the model finishes.
 */
export function buildActionTools(ctx: Ctx): { tools: AssistantToolDefinition[]; proposals: Proposal[] } {
  const proposals: Proposal[] = [];
  const expenseCats = ctx.categories.filter((c) => c.kind === 'expense');
  const incomeCats = ctx.categories.filter((c) => c.kind === 'income');
  const everyday = ctx.accounts.find((a) => a.type === 'chequing') ?? ctx.accounts.find((a) => a.type !== 'credit_card') ?? ctx.accounts[0];
  const cards = ctx.accounts.filter((a) => a.type === 'credit_card');

  const propose = (p: Omit<Proposal, 'id'>) => {
    const parsed = ACTION_PARAMS[p.kind].safeParse(p.params);
    if (!parsed.success) return { error: `Could not set that up: ${parsed.error.issues[0]?.message ?? 'invalid'}` };
    // One card per kind of thing: a repeat call replaces the earlier proposal.
    const same = proposals.findIndex((x) => x.kind === p.kind && JSON.stringify(x.params) === JSON.stringify(parsed.data));
    if (same === -1) proposals.push({ ...p, params: parsed.data, id: randomUUID() });
    return { proposed: true, card: p.title, note: NOT_DONE };
  };

  const tools: AssistantToolDefinition[] = [
    {
      name: 'propose_add_purchase',
      description: 'Offer to record a purchase (or money received) the person tells you about, e.g. "I spent $14 at Tim Hortons". Use only when they clearly want it recorded.',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['amount', 'description'],
        properties: {
          amount: { type: 'number', description: 'Dollars, positive.' },
          description: { type: 'string', description: 'Where or what, e.g. "Tim Hortons".' },
          date: { type: 'string', description: 'YYYY-MM-DD. Leave out for today.' },
          category: { type: 'string', description: `One of: ${expenseCats.map((c) => c.name).join(', ')}` },
          account: { type: 'string', description: `Which account paid. One of: ${ctx.accounts.map((a) => a.name).join(', ') || 'none yet'}. Leave out for the everyday account.` },
          income: { type: 'boolean', description: 'True if this is money coming in rather than a purchase.' },
        },
      },
      run: async (input) => {
        const account = findByName(ctx.accounts, input.account as string) ?? everyday;
        if (!account) return { error: 'There is no account to record it in yet. Suggest they add their everyday balance in Accounts first.' };
        const income = Boolean(input.income);
        const cat = findByName(income ? incomeCats : expenseCats, input.category as string);
        const amount = Number(input.amount);
        const date = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) && input.date <= ctx.today ? input.date : ctx.today;
        return propose({
          kind: 'add_purchase',
          title: income ? `Add ${fmt(amount)} coming in from ${input.description}` : `Add ${fmt(amount)} at ${input.description}`,
          detail: [cat?.name ?? 'No category yet', account.name, date === ctx.today ? 'today' : date].join(' · '),
          confirm: 'Add it',
          params: { amount, description: String(input.description ?? ''), date, categoryId: cat?.id ?? null, accountId: account.id, income },
        });
      },
    },
    {
      name: 'propose_add_bill',
      description: 'Offer to add a monthly bill so it shows before payday and in reminders, e.g. "my phone bill is $65 on the 12th".',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['name', 'amount', 'dayOfMonth'],
        properties: {
          name: { type: 'string' }, amount: { type: 'number', description: 'Dollars.' },
          dayOfMonth: { type: 'integer', minimum: 1, maximum: 31 },
          category: { type: 'string', description: `One of: ${expenseCats.map((c) => c.name).join(', ')}` },
        },
      },
      run: async (input) => {
        const cat = findByName(expenseCats, input.category as string);
        const amount = Number(input.amount); const day = Number(input.dayOfMonth);
        return propose({
          kind: 'add_bill', title: `Add ${input.name}: ${fmt(amount)} a month`, detail: `On the ${day}${['th', 'st', 'nd', 'rd'][day % 10 > 3 || [11, 12, 13].includes(day % 100) ? 0 : day % 10]} · ${cat?.name ?? 'Bills'}`,
          confirm: 'Add bill', params: { name: String(input.name ?? ''), amount, dayOfMonth: day, categoryId: cat?.id ?? null },
        });
      },
    },
    {
      name: 'propose_create_goal',
      description: 'Offer to start a savings goal, e.g. "I want to save $3,000 for Japan by next summer".',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['name', 'target'],
        properties: { name: { type: 'string' }, target: { type: 'number', description: 'Dollars.' }, targetDate: { type: 'string', description: 'YYYY-MM-DD, if they gave one.' } },
      },
      run: async (input) => {
        const target = Number(input.target);
        const date = typeof input.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.targetDate) && input.targetDate > ctx.today ? input.targetDate : null;
        return propose({
          kind: 'create_goal', title: `Start a goal: ${input.name}`, detail: `${fmt(target)}${date ? ` by ${date}` : ''}`,
          confirm: 'Start goal', params: { name: String(input.name ?? ''), target, targetDate: date },
        });
      },
    },
    {
      name: 'propose_set_budget',
      description: 'Offer to set the monthly budget for one category, e.g. "keep eating out under $200".',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['category', 'amount'],
        properties: { category: { type: 'string', description: `One of: ${expenseCats.map((c) => c.name).join(', ')}` }, amount: { type: 'number', description: 'Dollars per month.' } },
      },
      run: async (input) => {
        const cat = findByName(expenseCats, input.category as string);
        if (!cat) return { error: `No category called "${input.category}". Pick one from the list.` };
        const amount = Number(input.amount);
        return propose({
          kind: 'set_budget', title: `Budget ${fmt(amount)} a month for ${cat.name}`, detail: 'Pockit warns you at 80% and if it goes over.',
          confirm: 'Set budget', params: { categoryId: cat.id, categoryName: cat.name, amount },
        });
      },
    },
    {
      name: 'propose_set_card_due_day',
      description: 'Offer to save the day of the month a credit card payment is due, so Pockit reminds them.',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['card', 'day'],
        properties: { card: { type: 'string', description: `One of: ${cards.map((c) => c.name).join(', ') || 'no cards yet'}` }, day: { type: 'integer', minimum: 1, maximum: 31 } },
      },
      run: async (input) => {
        const card = findByName(cards, input.card as string) ?? (cards.length === 1 ? cards[0]! : null);
        if (!card) return { error: cards.length ? 'Ask which card.' : 'They have no credit card in Pockit yet.' };
        const day = Number(input.day);
        return propose({
          kind: 'set_card_due_day', title: `${card.name}: due on day ${day}`, detail: 'A reminder 3 days before and on the day.',
          confirm: 'Save', params: { accountId: card.id, day },
        });
      },
    },
    {
      name: 'open_screen',
      description: 'Offer a button that takes them to a screen in the app, when showing them is more useful than describing it.',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['screen'],
        properties: { screen: { type: 'string', enum: Object.keys(SCREENS) } },
      },
      run: async (input) => {
        const s = SCREENS[input.screen as Screen];
        if (!s) return { error: 'Unknown screen.' };
        return propose({ kind: 'open_screen', title: s.label, detail: null, confirm: `Open ${s.label}`, params: { screen: input.screen } });
      },
    },
  ];
  return { tools, proposals };
}

export const ACTIONS_BRIEF = `
You can also DO things in Pockit for the person, through the propose_* tools and open_screen. Each one only shows them a card with a button; nothing changes unless they tap it.
- Use one when they tell you about money they spent or will pay, ask you to set something up, or say "add", "set", "remind me", "track", "budget", "save for".
- Fill in what they said; leave out what they didn't (never invent an amount or a date).
- Then reply in one or two sentences, e.g. "Here it is, tap Add it to save it." Never claim it's saved.
- If something is missing (which card, how much), ask instead of guessing.
- open_screen is for "show me", "where do I", or when a screen answers better than words.`;
