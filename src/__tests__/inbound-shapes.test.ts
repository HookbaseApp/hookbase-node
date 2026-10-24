import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';

/**
 * Response shapes the inbound/admin routes really send (api/src/routes/*.ts and the plpgsql
 * functions behind them), where they differ from what the SDK's types promise.
 */
function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(data),
  };
}

describe('inbound response shapes', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
  });

  const url = (i = 0) => new URL(mockFetch.mock.calls[i][0] as string);
  const init = (i = 0) => mockFetch.mock.calls[i][1] as { method: string; body?: string };

  it('events.debug returns null curlCommand for a transient event', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ event: { id: 'e' }, transient: true, debug: { curlCommand: null } }));
    const info = await client.events.debug('e');
    expect(info.curlCommand).toBeNull();
  });

  it('filters: parses text `conditions` from list and get (fn_filter_list/get return text)', async () => {
    const conditions = [{ field: 'type', operator: 'eq', value: 'push' }];
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ filters: [{ id: 'f1', conditions: JSON.stringify(conditions) }], pagination: { total: 1, page: 1, pageSize: 20 } }))
      .mockResolvedValueOnce(jsonResponse({ filter: { id: 'f1', conditions: JSON.stringify(conditions) } }))
      .mockResolvedValueOnce(jsonResponse({ filter: { id: 'f1', conditions } }));
    expect((await client.filters.list()).data[0].conditions).toEqual(conditions);
    expect((await client.filters.get('f1')).conditions).toEqual(conditions);
    // Already an array: left alone.
    expect((await client.filters.get('f1')).conditions).toEqual(conditions);
  });

  it('routes: parses text `filterConditions` from list and get', async () => {
    const fc = [{ field: 'a', operator: 'eq', value: 1 }];
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ routes: [{ id: 'r1', filterConditions: JSON.stringify(fc) }], pagination: { total: 1, page: 1, pageSize: 20 } }))
      .mockResolvedValueOnce(jsonResponse({ route: { id: 'r1', filterConditions: JSON.stringify(fc) } }))
      .mockResolvedValueOnce(jsonResponse({ route: { id: 'r1', filterConditions: null } }));
    expect((await client.routes.list()).data[0].filterConditions).toEqual(fc);
    expect((await client.routes.get('r1')).filterConditions).toEqual(fc);
    expect((await client.routes.get('r1')).filterConditions).toBeNull();
  });

  it('schemas: parses list jsonSchema and mirrors create json_schema', async () => {
    const js = { type: 'object' };
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ schemas: [{ id: 's1', jsonSchema: JSON.stringify(js) }] }))
      .mockResolvedValueOnce(jsonResponse({ schema: { id: 's1', name: 'S', slug: 's', json_schema: js } }, 201));
    expect((await client.schemas.list()).data[0].jsonSchema).toEqual(js);
    const created = await client.schemas.create({ name: 'S', jsonSchema: js });
    expect(created.jsonSchema).toEqual(js);
    expect(init(1).method).toBe('POST');
    expect(JSON.parse(init(1).body!)).toEqual({ name: 'S', jsonSchema: js });
  });

  it('schemas.validate returns {path, message} errors', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ valid: false, errors: [{ path: '.id', message: 'Expected string' }], payload: { id: 1 } }));
    const res = await client.schemas.validate('s1', { id: 1 });
    expect(res.errors[0]).toEqual({ path: '.id', message: 'Expected string' });
    expect(url().pathname).toBe('/api/schemas/s1/validate');
  });

  it('transforms.create maps the snake_case create response', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ transform: { id: 't1', name: 'T', slug: 't', code: 'x', transform_type: 'liquid', input_format: 'json', output_format: 'text' } })
    );
    const t = await client.transforms.create({ name: 'T', transformType: 'liquid', code: 'x' });
    expect(t.transformType).toBe('liquid');
    expect(t.inputFormat).toBe('json');
    expect(t.outputFormat).toBe('text');
  });

  it('apiKeys: keyPrefix (with prefix mirror) and JSON-string scopes on list', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ apiKeys: [{ id: 'k1', name: 'CI', keyPrefix: 'whr_ab12', scopes: '["read","write"]', expiresAt: null }] }))
      .mockResolvedValueOnce(jsonResponse({ apiKey: { id: 'k2', name: 'N', key: 'whr_full', keyPrefix: 'whr_full', scopes: ['read'], expiresAt: null } }, 201));
    const [k] = await client.apiKeys.list();
    expect(k.keyPrefix).toBe('whr_ab12');
    expect(k.prefix).toBe('whr_ab12');
    expect(k.scopes).toEqual(['read', 'write']);
    const created = await client.apiKeys.create({ name: 'N', scopes: ['read'], expiresInDays: 1 });
    expect(created.key).toBe('whr_full');
    expect(created.prefix).toBe('whr_full');
    expect(JSON.parse(init(1).body!)).toMatchObject({ name: 'N', scopes: ['read'], expiresIn: 86400 });
  });

  it('apiKeys.create surfaces the API refusing an API-key-authenticated caller', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'This endpoint requires a user session, not an API key' }, 403));
    await expect(client.apiKeys.create({ name: 'x' })).rejects.toMatchObject({
      status: 403,
      message: 'This endpoint requires a user session, not an API key',
    });
  });

  it('tunnels.create returns authToken, tunnelUrl and wsUrl; delete hits DELETE /:id', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(
          {
            tunnel: { id: 'tun_1', name: 'dev', subdomain: 'abc', status: 'disconnected', auth_token: 'tok', createdAt: 'x' },
            tunnelUrl: 'https://api.hookbase.app/t/abc',
            wsUrl: 'wss://api.hookbase.app/tunnels/abc/ws?tunnelId=tun_1&token=tok',
            message: 'Tunnel created.',
          },
          201
        )
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const t = await client.tunnels.create({ name: 'dev', localPort: 3000 });
    expect(JSON.parse(init(0).body!)).toEqual({ name: 'dev' });
    expect(t.authToken).toBe('tok');
    expect(t.tunnelUrl).toBe('https://api.hookbase.app/t/abc');
    expect(t.wsUrl).toContain('token=tok');
    await client.tunnels.delete('tun_1');
    expect(init(1).method).toBe('DELETE');
    expect(url(1).pathname).toBe('/api/tunnels/tun_1');
  });

  it('analytics.dashboard maps the unwrapped response and sends tz/source scope', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        overview: { total_events: 10, successful_deliveries: 8, failed_deliveries: 2, avg_latency: 120 },
        timeline: [],
        range: '7d',
        interval: 'day',
      })
    );
    const d = await client.analytics.dashboard('7d', { tz: 'Europe/Berlin', sourceId: '7d6c0b8e-1f0e-4a43-9d5b-6b1a1f6f8a10' });
    expect(url().pathname).toBe('/api/analytics/dashboard');
    expect(url().searchParams.get('range')).toBe('7d');
    expect(url().searchParams.get('tz')).toBe('Europe/Berlin');
    expect(url().searchParams.get('sourceId')).toBe('7d6c0b8e-1f0e-4a43-9d5b-6b1a1f6f8a10');
    expect(d.overview).toEqual({ totalEvents: 10, successfulDeliveries: 8, failedDeliveries: 2, avgLatency: 120 });
    expect(d.eventsReceived).toBe(10);
    expect(d.deliveriesFailed).toBe(2);
    expect(d.avgLatencyMs).toBe(120);
    expect(d.range).toBe('7d');
  });

  it('analytics.overview maps snake_case stats and keeps the raw object', async () => {
    const stats = { total_events: 5, successful_deliveries: 4, failed_deliveries: 1, avg_latency: null, source_count: 2, destination_count: 3 };
    mockFetch.mockResolvedValueOnce(jsonResponse({ stats }));
    const o = await client.analytics.overview({ startDate: '2026-01-01' });
    expect(url().search).toBe('');
    expect(o).toMatchObject({ totalEvents: 5, successfulDeliveries: 4, failedDeliveries: 1, avgLatency: null, sourceCount: 2, destinationCount: 3 });
    expect(o.stats).toEqual(stats);
  });
});
