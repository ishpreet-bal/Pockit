import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

describe('mobile browser CORS', () => {
  it('allows a localhost preview to request a shared workspace', () => {
    const response = middleware(new NextRequest('http://localhost:3000/api/mobile/summary', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:8081',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization,content-type,x-pockit-space',
      },
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    expect(response.headers.get('access-control-allow-headers')).toContain('x-pockit-space');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it.each(['https://example.com', 'http://localhost.example.com', 'null'])('does not grant access to %s', (origin) => {
    const response = middleware(new NextRequest('http://localhost:3000/api/mobile/summary', {
      method: 'OPTIONS', headers: { origin },
    }));
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
