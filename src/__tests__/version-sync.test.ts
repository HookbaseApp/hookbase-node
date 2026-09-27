import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The SDK version appears twice -- in package.json, and as SDK_VERSION in client.ts, which is what
 * goes out in the User-Agent header. Nothing kept them in step, and they drifted: package.json
 * reached 3.0.1 while SDK_VERSION sat at 2.1.0, so every request from every 2.x and 3.0 release
 * told the API it came from 2.1.0. Nothing fails when that happens -- the header is still
 * well-formed, the requests still work -- which is why it went unnoticed across several releases,
 * and why it needs a test rather than care at release time.
 */
describe('version sync', () => {
  const packageVersion = (): string => {
    const raw = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
    return JSON.parse(raw).version;
  };

  /** SDK_VERSION is module-private, so read it from the source rather than exporting it for a test. */
  const clientVersion = (): string => {
    const src = readFileSync(join(__dirname, '..', 'client.ts'), 'utf8');
    const match = src.match(/const SDK_VERSION = '([^']+)';/);
    if (!match) throw new Error('SDK_VERSION not found in client.ts');
    return match[1];
  };

  it('SDK_VERSION in client.ts matches the version in package.json', () => {
    expect(clientVersion()).toBe(packageVersion());
  });

  it('reports that version in the User-Agent', async () => {
    const { Hookbase } = await import('../client');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
      json: () => Promise.resolve({ apiKeys: [] }),
    });

    const client = new Hookbase({ apiKey: 'test_api_key', fetch: mockFetch, retries: 0 });
    await client.apiKeys.list();

    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['User-Agent']).toBe(`hookbase-sdk-node/${packageVersion()}`);
  });
});
