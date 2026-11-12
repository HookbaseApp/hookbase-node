import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';

/**
 * Holds while a circuit is open (api/migrations/pg/0134_holds_recovery.sql): the held statuses,
 * `holdExpiresAt`, the `holdOnCircuitOpen` opt-out and the held counts, checked against the routes
 * that serve them (api/src/routes/routes.ts, webhook-endpoints.ts, deliveries.ts,
 * outbound-messages.ts). Each mocked response is the shape the route builds.
 */

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

function call(mockFetch: ReturnType<typeof vi.fn>, i = 0) {
  const [url, init] = mockFetch.mock.calls[i];
  return {
    url: new URL(url as string),
    method: init.method as string,
    body: init.body === undefined ? undefined : JSON.parse(init.body as string),
    headers: init.headers as Record<string, string>,
  };
}

describe('holds while a circuit is open', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
  });

  it('routes.create and update send holdOnCircuitOpen', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ route: { id: 'r1', holdOnCircuitOpen: false } }, 201))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    const route = await client.routes.create({ name: 'R', sourceId: 's1', destinationId: 'd1', holdOnCircuitOpen: false });
    await client.routes.update('r1', { holdOnCircuitOpen: true });

    expect(call(mockFetch, 0).body).toMatchObject({ holdOnCircuitOpen: false });
    expect(call(mockFetch, 1).body).toEqual({ holdOnCircuitOpen: true });
    expect(route.holdOnCircuitOpen).toBe(false);
  });

  it('routes.get returns the held count', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ route: { id: 'r1', holdOnCircuitOpen: true, heldCount: 10000, heldCountCapped: true, filterConditions: null } })
    );

    const route = await client.routes.get('r1');

    expect(route.holdOnCircuitOpen).toBe(true);
    expect(route.heldCount).toBe(10000);
    expect(route.heldCountCapped).toBe(true);
  });

  it('endpoints.create and update send holdOnCircuitOpen, and get returns the held count', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'ep_1', headers: [], holdOnCircuitOpen: false } }, 201))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'ep_1', headers: [], holdOnCircuitOpen: true } }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { id: 'ep_1', headers: [], holdOnCircuitOpen: true, heldCount: 4, heldCountCapped: false } })
      );

    await client.endpoints.create('app_1', { url: 'https://a.example/hook', holdOnCircuitOpen: false });
    await client.endpoints.update('app_1', 'ep_1', { holdOnCircuitOpen: true });
    const endpoint = await client.endpoints.get('app_1', 'ep_1');

    expect(call(mockFetch, 0).body).toMatchObject({ applicationId: 'app_1', holdOnCircuitOpen: false });
    expect(call(mockFetch, 1).body).toEqual({ holdOnCircuitOpen: true });
    expect(endpoint.holdOnCircuitOpen).toBe(true);
    expect(endpoint.heldCount).toBe(4);
    expect(endpoint.heldCountCapped).toBe(false);
  });

  it('a held delivery carries holdExpiresAt; any other gets null', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          deliveries: [
            { id: 'del_1', status: 'held', nextRetryAt: null, holdExpiresAt: '2026-11-12T00:00:00.000Z' },
            { id: 'del_2', status: 'awaiting_retry', nextRetryAt: '2026-11-11T22:00:00.000Z', holdExpiresAt: null },
          ],
          limit: 50,
          offset: 0,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ delivery: { id: 'del_3', status: 'delivered', nextRetryAt: null } }));

    const page = await client.deliveries.list({ status: 'held' });
    const older = await client.deliveries.get('del_3');

    expect(call(mockFetch, 0).url.searchParams.get('status')).toBe('held');
    expect(page.data[0].holdExpiresAt).toBe('2026-11-12T00:00:00.000Z');
    expect(page.data[0].nextRetryAt).toBeNull();
    expect(page.data[1].holdExpiresAt).toBeNull();
    // A response without the field (an API from before holds) reads as null, not undefined.
    expect(older.holdExpiresAt).toBeNull();
  });

  it('outbound messages carry holdExpiresAt; any other gets null', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 'msg_1', eventId: 'e1', status: 'held', holdExpiresAt: '2026-11-12T00:00:00.000Z' }],
          pagination: { hasMore: false, nextCursor: null },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'msg_2', eventId: 'e2', status: 'success' } }));

    const page = await client.messages.list('app_1');
    const message = await client.messages.get('app_1', 'msg_2');

    expect(page.data[0].status).toBe('held');
    expect(page.data[0].holdExpiresAt).toBe('2026-11-12T00:00:00.000Z');
    // A response without the field (an API from before holds) reads as null, not undefined.
    expect(message.holdExpiresAt).toBeNull();
  });

  it('the outbound stats summary counts held messages', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: { pending: 1, processing: 0, success: 5, failed: 0, awaitingRetry: 2, held: 3, exhausted: 0, dlq: 0, total: 11 },
      })
    );

    const stats = await client.messages.getStatsSummary();

    expect(stats.held).toBe(3);
  });
});
