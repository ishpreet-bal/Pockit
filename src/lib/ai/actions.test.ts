import { describe, expect, it } from 'vitest';
import { buildActionTools } from './actions';

const ctx = {
  today: '2026-11-12', currency: 'CAD',
  categories: [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Coffee', kind: 'expense' },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Restaurants', kind: 'expense' },
    { id: '33333333-3333-4333-8333-333333333333', name: 'Salary', kind: 'income' },
  ],
  accounts: [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'TD Chequing', type: 'chequing' },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Amex Cobalt', type: 'credit_card' },
  ],
};
const tool = (t: ReturnType<typeof buildActionTools>, name: string) => t.tools.find((x) => x.name === name)!;

describe('Pock actions only ever propose', () => {
  it('a purchase becomes a card, filled from what was said', async () => {
    const t = buildActionTools(ctx);
    const r = await tool(t, 'propose_add_purchase').run({ amount: 14.5, description: 'Tim Hortons', category: 'coffee' }) as { note: string };
    expect(r.note).toMatch(/NOTHING HAS CHANGED/);
    expect(t.proposals).toHaveLength(1);
    expect(t.proposals[0]).toMatchObject({ kind: 'add_purchase', title: 'Add $14.50 at Tim Hortons', params: { categoryId: ctx.categories[0]!.id, accountId: ctx.accounts[0]!.id, date: '2026-11-12' } });
  });
  it('a date in the future is not believed', async () => {
    const t = buildActionTools(ctx);
    await tool(t, 'propose_add_purchase').run({ amount: 5, description: 'x', date: '2027-01-01' });
    expect(t.proposals[0]!.params.date).toBe('2026-11-12');
  });
  it('the card is found by a loose name, and the only card when none is named', async () => {
    const t = buildActionTools(ctx);
    await tool(t, 'propose_set_card_due_day').run({ card: 'amex', day: 21 });
    await tool(t, 'propose_set_card_due_day').run({ card: 'the visa', day: 3 });
    expect(t.proposals.map((p) => p.params.day)).toEqual([21, 3]);
    expect(t.proposals.every((p) => p.params.accountId === ctx.accounts[1]!.id)).toBe(true);
  });
  it('an unknown budget category is refused, so the model asks', async () => {
    const t = buildActionTools(ctx);
    const r = await tool(t, 'propose_set_budget').run({ category: 'Yachts', amount: 200 }) as { error?: string };
    expect(r.error).toBeTruthy();
    expect(t.proposals).toHaveLength(0);
  });
  it('a bad amount is refused rather than proposed', async () => {
    const t = buildActionTools(ctx);
    const r = await tool(t, 'propose_create_goal').run({ name: 'Japan', target: -5 }) as { error?: string };
    expect(r.error).toBeTruthy();
    expect(t.proposals).toHaveLength(0);
  });
  it('the same offer twice is one card', async () => {
    const t = buildActionTools(ctx);
    await tool(t, 'open_screen').run({ screen: 'bills' });
    await tool(t, 'open_screen').run({ screen: 'bills' });
    expect(t.proposals).toHaveLength(1);
  });
});
