import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/auth/api', () => ({ requireAuthApi: async () => ({ user: { id: 'u' }, workspace: { id: 'w' } }) }));

describe('vehicle picker API', () => {
  it.each(['year=0', 'year=2025.5', 'year=bad', 'id=-1', 'id=1.2', 'id=Infinity', 'make=Toyota', 'year=2025&model=Corolla'])('rejects malformed parameters: %s', async (query) => {
    expect((await GET(new Request(`http://localhost/api/mobile/vehicles?${query}`))).status).toBe(400);
  });
  it('returns current model choices from the bundle', async () => {
    const response = await GET(new Request('http://localhost/api/mobile/vehicles?year=2025&make=Toyota'));
    expect(response.status).toBe(200);
    expect((await response.json()).items).toContain('Corolla');
  });
});
