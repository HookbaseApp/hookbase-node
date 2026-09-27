import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';
import type { Endpoint } from '../types';

/**
 * What an `Endpoint` actually contains after a call returns.
 *
 * The declared type and the response had drifted apart in both directions. `Endpoint` declared
 * `headers: Record<string, string> | null`, and the API sends an array of `{name, value}` — so
 * `endpoint.headers['X-Tenant']` type-checked and was `undefined` at runtime. It declared
 * `secret: string`, which only a create response carries. It declared `filterTypes`, `rateLimit`,
 * `rateLimitPeriod` and `metadata`, none of which are columns the API has. And it omitted twenty
 * fields the API does send, including all six of the retry/rate settings that the API itself was not
 * returning until they were added to its response (the write-only settings this pairs with).
 *
 * Every one of those was invisible to tsc, because a type that disagrees with the wire compiles
 * perfectly. These check the object the caller is handed.
 */

const mockResponse = (body: unknown, status = 200) => ({
  ok: true,
  status,
  headers: new Map(),
  json: () => Promise.resolve(body),
});

/** Every key the API's formatEndpoint returns, populated with non-default values. */
const ENDPOINT_ROW = {
  id: 'ep_1',
  applicationId: 'app_1',
  url: 'https://customer.example.com/hooks',
  description: 'Primary',
  secretPrefix: 'whsec_abcdef...',
  hasSecret: true,
  secretVersion: 2,
  headers: [{ name: 'X-Tenant', value: 'acme' }],
  timeoutSeconds: 45,
  isDisabled: false,
  disabledAt: null,
  disabledReason: null,
  rateLimitPerSecond: 25,
  successStatusCodes: [200, 201, '2xx'],
  backoffType: 'linear',
  retryDelays: [5, 30, 300],
  ipAllowlistNotes: 'egress from 203.0.113.0/24',
  useStaticIp: true,
  circuitState: 'closed',
  circuitOpenedAt: null,
  circuitFailureCount: 1,
  circuitFailureThreshold: 7,
  circuitSuccessThreshold: 3,
  circuitCooldownSeconds: 120,
  totalMessages: 900,
  totalSuccesses: 880,
  totalFailures: 20,
  avgResponseTimeMs: 143,
  lastSuccessAt: '2026-01-05T00:00:00Z',
  lastFailureAt: '2026-01-04T00:00:00Z',
  lastResponseStatus: 200,
  isVerified: true,
  verifiedAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-06T00:00:00Z',
  createdBy: 'u1',
  apiKeyId: null,
} as const;

describe('endpoint responses', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new Hookbase({ apiKey: 'test_api_key', fetch: mockFetch, retries: 0 });
  });

  it('exposes the six settings that used to be write-only', async () => {
    // These are configurable on create and update, are acted on by the delivery path, and were in
    // no response at all until the API started returning them. A caller could set a retry schedule
    // and had no way to read back what an endpoint was configured with.
    mockFetch.mockResolvedValueOnce(mockResponse({ data: ENDPOINT_ROW }));

    const endpoint = await client.endpoints.get('app_1', 'ep_1');

    expect(endpoint.rateLimitPerSecond).toBe(25);
    expect(endpoint.successStatusCodes).toEqual([200, 201, '2xx']);
    expect(endpoint.backoffType).toBe('linear');
    expect(endpoint.retryDelays).toEqual([5, 30, 300]);
    expect(endpoint.ipAllowlistNotes).toBe('egress from 203.0.113.0/24');
    expect(endpoint.useStaticIp).toBe(true);
  });

  it('declares a property for every key the API sends', async () => {
    // Compile-time: the conditional resolves to `never` the moment a key of the fixture is not a key
    // of Endpoint, and `true` is not assignable to `never`. An excess-property check would not do
    // this — TypeScript does not apply one through a spread.
    const covered: keyof typeof ENDPOINT_ROW extends keyof Endpoint ? true : never = true;
    expect(covered).toBe(true);

    // Runtime: nothing the response carried may be dropped on the way out.
    mockFetch.mockResolvedValueOnce(mockResponse({ data: ENDPOINT_ROW }));
    const endpoint = await client.endpoints.get('app_1', 'ep_1');

    for (const key of Object.keys(ENDPOINT_ROW)) {
      expect(endpoint, key).toHaveProperty(key);
    }
  });

  it('folds the wire array of headers into the record the type promises', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      data: { ...ENDPOINT_ROW, headers: [{ name: 'X-Tenant', value: 'acme' }, { name: 'X-Env', value: 'prod' }] },
    }));

    const endpoint = await client.endpoints.get('app_1', 'ep_1');

    expect(endpoint.headers).toEqual({ 'X-Tenant': 'acme', 'X-Env': 'prod' });
    // And the wire shape stays reachable, because a caller round-tripping headers back into an
    // update needs the array, not a lossy record of it.
    expect(endpoint.headerList).toEqual([
      { name: 'X-Tenant', value: 'acme' },
      { name: 'X-Env', value: 'prod' },
    ]);
  });

  it('turns an empty header array into an empty record, not null', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { ...ENDPOINT_ROW, headers: [] } }));

    const endpoint = await client.endpoints.get('app_1', 'ep_1');

    expect(endpoint.headers).toEqual({});
    expect(endpoint.headerList).toEqual([]);
  });

  it('reports the never-returned fields as null rather than undefined', async () => {
    // filterTypes, rateLimit, rateLimitPeriod and metadata are declared non-optional and the API has
    // no such columns. `null` is what their docs promise; `undefined` is what they were.
    mockFetch.mockResolvedValueOnce(mockResponse({ data: ENDPOINT_ROW }));

    const endpoint = await client.endpoints.get('app_1', 'ep_1');

    expect(endpoint.filterTypes).toBeNull();
    expect(endpoint.rateLimit).toBeNull();
    expect(endpoint.rateLimitPeriod).toBeNull();
    expect(endpoint.metadata).toBeNull();
  });

  it('normalises list and listAll results too', async () => {
    // A caller who reads headers off a get and not off a list would find it works in one place.
    mockFetch
      .mockResolvedValueOnce(mockResponse({
        data: [{ ...ENDPOINT_ROW, subscriptionCount: 3 }],
        pagination: { hasMore: false, nextCursor: null },
      }))
      .mockResolvedValueOnce(mockResponse({
        data: [ENDPOINT_ROW],
        pagination: { hasMore: false, nextCursor: null },
      }));

    const page = await client.endpoints.list('app_1');
    expect(page.data[0].headers).toEqual({ 'X-Tenant': 'acme' });
    expect(page.data[0].subscriptionCount).toBe(3);

    for await (const endpoint of client.endpoints.listAll('app_1')) {
      expect(endpoint.headers).toEqual({ 'X-Tenant': 'acme' });
      expect(endpoint.retryDelays).toEqual([5, 30, 300]);
    }
  });

  it('normalises create and update results', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({ data: { ...ENDPOINT_ROW, secret: 'whsec_plaintext' } }, 201))
      .mockResolvedValueOnce(mockResponse({ data: ENDPOINT_ROW }));

    const created = await client.endpoints.create('app_1', { url: 'https://customer.example.com/hooks' });
    expect(created.headers).toEqual({ 'X-Tenant': 'acme' });
    // Create is the one response that carries the plaintext secret, and normalising must not eat it.
    expect(created.secret).toBe('whsec_plaintext');

    const updated = await client.endpoints.update('app_1', 'ep_1', { retryDelays: [10] });
    expect(updated.headers).toEqual({ 'X-Tenant': 'acme' });
  });

  it('reports the real average latency from getStats', async () => {
    // averageLatency was hardcoded to 0, because `Endpoint` had no field for the avgResponseTimeMs
    // the API sends. Every endpoint looked infinitely fast.
    mockFetch.mockResolvedValueOnce(mockResponse({ data: ENDPOINT_ROW }));

    const stats = await client.endpoints.getStats('app_1', 'ep_1');

    expect(stats.averageLatency).toBe(143);
    expect(stats.totalMessages).toBe(900);
    expect(stats.successRate).toBeCloseTo((880 / 900) * 100);
  });
});
