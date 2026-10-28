import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/auth/api', () => ({ requireAuthApi: async () => ({
  user: { id: 'user', timezone: 'America/Toronto' },
  workspace: { id: 'workspace', baseCurrency: 'CAD' },
}) }));
vi.mock('@/lib/data/repository', () => ({ WorkspaceRepo: class {
  async listTransactions() { return []; }
  async listCategories() { return []; }
  async listAccounts() { return []; }
} }));
vi.mock('@/lib/data/cost-shares', () => ({ listShares: async () => [] }));

describe('mobile transaction month selection', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-03-01T02:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  it('defaults to the user’s month rather than the server’s month', async () => {
    const response = await GET(new Request('http://localhost/api/mobile/transactions'));
    expect((await response.json()).month).toBe('2026-02');
  });

  it.each(['2026-00', '2026-13', '0000-01', 'not-a-month'])('handles invalid month %s without a database error', async (month) => {
    const response = await GET(new Request(`http://localhost/api/mobile/transactions?month=${month}`));
    expect(response.status).toBe(200);
    expect((await response.json()).month).toBe('2026-02');
  });

  it('keeps an explicitly chosen valid month', async () => {
    const response = await GET(new Request('http://localhost/api/mobile/transactions?month=2024-02'));
    expect((await response.json()).month).toBe('2024-02');
  });
});
