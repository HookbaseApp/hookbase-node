import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';
import { HookbaseNotFoundError } from '../errors';

/**
 * One row per public method not covered elsewhere: the HTTP method, path, query and body each one
 * sends, checked against the route it targets in api/src/index.ts + api/src/routes/*.ts.
 */
function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(data),
  };
}

const pageOf = (key: string, items: unknown[], total = items.length) => ({
  [key]: items,
  pagination: { total, page: 1, pageSize: 20 },
});
const cursorPage = (items: unknown[]) => ({ data: items, pagination: { hasMore: false, nextCursor: null } });

type Row = {
  name: string;
  run: (c: Hookbase) => Promise<unknown>;
  response?: unknown;
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  check?: (result: unknown) => void;
};

const rows: Row[] = [
  // Cron jobs (api/src/routes/cron.ts, cron-groups.ts)
  { name: 'cronJobs.get', run: (c) => c.cronJobs.get('cj_1'), response: { cronJob: { id: 'cj_1' } }, method: 'GET', path: '/api/cron/cj_1', check: (r) => expect(r).toMatchObject({ id: 'cj_1' }) },
  { name: 'cronJobs.update', run: (c) => c.cronJobs.update('cj_1', { name: 'n' }), response: { success: true }, method: 'PATCH', path: '/api/cron/cj_1', body: { name: 'n' } },
  { name: 'cronJobs.delete', run: (c) => c.cronJobs.delete('cj_1'), response: { success: true }, method: 'DELETE', path: '/api/cron/cj_1' },
  { name: 'cronJobs.trigger', run: (c) => c.cronJobs.trigger('cj_1'), response: { execution: { id: 'ex_1', status: 'success' } }, method: 'POST', path: '/api/cron/cj_1/trigger', check: (r) => expect(r).toMatchObject({ id: 'ex_1' }) },
  { name: 'cronJobs.listGroups', run: (c) => c.cronJobs.listGroups(), response: { groups: [{ id: 'g1' }] }, method: 'GET', path: '/api/cron-groups', check: (r) => expect(r).toEqual([{ id: 'g1' }]) },
  { name: 'cronJobs.createGroup', run: (c) => c.cronJobs.createGroup({ name: 'G' }), response: { group: { id: 'g1', name: 'G' } }, method: 'POST', path: '/api/cron-groups', body: { name: 'G' }, check: (r) => expect(r).toMatchObject({ id: 'g1' }) },

  // Destinations (destinations.ts)
  { name: 'destinations.export', run: (c) => c.destinations.export({ ids: ['d1', 'd2'] }), response: { destinations: [] }, method: 'GET', path: '/api/destinations/export', query: { ids: 'd1,d2' } },
  { name: 'destinations.bulkDelete', run: (c) => c.destinations.bulkDelete(['d1']), response: { success: true, deleted: 1 }, method: 'DELETE', path: '/api/destinations/bulk', body: { ids: ['d1'] }, check: (r) => expect(r).toEqual({ success: true, deleted: 1 }) },

  // Endpoints (webhook-endpoints.ts)
  { name: 'endpoints.delete', run: (c) => c.endpoints.delete('app_1', 'ep_1'), response: { success: true }, method: 'DELETE', path: '/api/webhook-endpoints/ep_1' },
  { name: 'endpoints.enable', run: (c) => c.endpoints.enable('app_1', 'ep_1'), response: { data: { id: 'ep_1', headers: [] } }, method: 'PATCH', path: '/api/webhook-endpoints/ep_1', body: { isDisabled: false } },
  { name: 'endpoints.disable', run: (c) => c.endpoints.disable('app_1', 'ep_1'), response: { data: { id: 'ep_1', headers: [] } }, method: 'PATCH', path: '/api/webhook-endpoints/ep_1', body: { isDisabled: true } },

  // Event types (event-types.ts)
  { name: 'eventTypes.list', run: (c) => c.eventTypes.list({ category: 'orders', isEnabled: true, limit: 10 }), response: cursorPage([{ id: 'et_1' }]), method: 'GET', path: '/api/event-types', query: { category: 'orders', isEnabled: 'true', limit: '10' } },
  { name: 'eventTypes.delete', run: (c) => c.eventTypes.delete('et_1'), response: { success: true }, method: 'DELETE', path: '/api/event-types/et_1' },
  { name: 'eventTypes.archive', run: (c) => c.eventTypes.archive('et_1'), response: { data: { id: 'et_1' } }, method: 'PATCH', path: '/api/event-types/et_1', body: { isEnabled: false } },
  { name: 'eventTypes.unarchive', run: (c) => c.eventTypes.unarchive('et_1'), response: { data: { id: 'et_1' } }, method: 'PATCH', path: '/api/event-types/et_1', body: { isEnabled: true } },
  { name: 'eventTypes.update', run: (c) => c.eventTypes.update('et_1', { schema: { type: 'object' } }), response: { data: { id: 'et_1' } }, method: 'PATCH', path: '/api/event-types/et_1', body: { schema: '{"type":"object"}' } },

  // Events (events.ts)
  { name: 'events.export', run: (c) => c.events.export({ format: 'csv', sourceId: 'stripe' }), response: 'id\n', method: 'GET', path: '/api/events/export', query: { format: 'csv', sourceId: 'stripe' } },

  // Filters (filters.ts)
  { name: 'filters.update', run: (c) => c.filters.update('f1', { name: 'n' }), response: { success: true }, method: 'PATCH', path: '/api/filters/f1', body: { name: 'n' } },
  { name: 'filters.delete', run: (c) => c.filters.delete('f1'), response: { success: true }, method: 'DELETE', path: '/api/filters/f1' },

  // Messages (outbound-messages.ts)
  { name: 'messages.resend', run: (c) => c.messages.resend('app_1', 'msg_1'), response: { data: { originalMessageId: 'msg_1', newMessageId: 'msg_2', status: 'queued' } }, method: 'POST', path: '/api/outbound-messages/msg_1/replay', check: (r) => expect(r).toMatchObject({ newMessageId: 'msg_2', messageId: 'msg_2' }) },
  { name: 'messages.getOutbound', run: (c) => c.messages.getOutbound('app_1', 'msg_1'), response: { data: { id: 'msg_1', eventId: 'e' } }, method: 'GET', path: '/api/outbound-messages/msg_1' },
  { name: 'messages.listOutbound', run: (c) => c.messages.listOutbound('app_1', 'ignored', { status: 'failed' }), response: cursorPage([]), method: 'GET', path: '/api/outbound-messages', query: { applicationId: 'app_1', status: 'failed' } },

  // Routes (routes.ts)
  { name: 'routes.update', run: (c) => c.routes.update('r1', { isActive: false }), response: { success: true }, method: 'PATCH', path: '/api/routes/r1', body: { isActive: false } },
  { name: 'routes.delete', run: (c) => c.routes.delete('r1'), response: { success: true }, method: 'DELETE', path: '/api/routes/r1' },
  { name: 'routes.export', run: (c) => c.routes.export({ ids: ['r1'] }), response: { routes: [] }, method: 'GET', path: '/api/routes/export', query: { ids: 'r1' } },

  // Schemas (schemas.ts)
  { name: 'schemas.update', run: (c) => c.schemas.update('s1', { name: 'n' }), response: { success: true }, method: 'PUT', path: '/api/schemas/s1', body: { name: 'n' } },
  { name: 'schemas.delete', run: (c) => c.schemas.delete('s1'), response: { success: true }, method: 'DELETE', path: '/api/schemas/s1' },

  // Sources (sources.ts)
  { name: 'sources.export', run: (c) => c.sources.export({ ids: ['s1'] }), response: { sources: [] }, method: 'GET', path: '/api/sources/export', query: { ids: 's1' } },

  // Subscriptions (webhook-subscriptions.ts)
  { name: 'subscriptions.list', run: (c) => c.subscriptions.list('app_1', { endpointId: 'ep_1', isEnabled: true }), response: cursorPage([{ id: 'sub_1' }]), method: 'GET', path: '/api/webhook-subscriptions', query: { applicationId: 'app_1', endpointId: 'ep_1', isEnabled: 'true' } },
  { name: 'subscriptions.enable', run: (c) => c.subscriptions.enable('app_1', 'sub_1'), response: { data: { id: 'sub_1' } }, method: 'PATCH', path: '/api/webhook-subscriptions/sub_1', body: { isEnabled: true } },
  { name: 'subscriptions.disable', run: (c) => c.subscriptions.disable('app_1', 'sub_1'), response: { data: { id: 'sub_1' } }, method: 'PATCH', path: '/api/webhook-subscriptions/sub_1', body: { isEnabled: false } },

  // Transforms (transforms.ts)
  { name: 'transforms.update', run: (c) => c.transforms.update('t1', { isActive: false }), response: { success: true }, method: 'PATCH', path: '/api/transforms/t1', body: { isActive: false } },
  { name: 'transforms.delete', run: (c) => c.transforms.delete('t1'), response: { success: true }, method: 'DELETE', path: '/api/transforms/t1' },

  // Tunnels (tunnels.ts)
  { name: 'tunnels.list', run: (c) => c.tunnels.list(), response: { tunnels: [{ id: 'tun_1' }] }, method: 'GET', path: '/api/tunnels', check: (r) => expect(r).toEqual([{ id: 'tun_1' }]) },
  { name: 'tunnels.get', run: (c) => c.tunnels.get('tun_1'), response: { tunnel: { id: 'tun_1' } }, method: 'GET', path: '/api/tunnels/tun_1', check: (r) => expect(r).toEqual({ id: 'tun_1' }) },
  { name: 'tunnels.bulkDelete', run: (c) => c.tunnels.bulkDelete(['tun_1']), response: { success: true, deleted: 1 }, method: 'DELETE', path: '/api/tunnels/bulk', body: { ids: ['tun_1'] } },

  // API keys (apiKeys.ts)
  { name: 'apiKeys.delete', run: (c) => c.apiKeys.delete('k1'), response: { success: true }, method: 'DELETE', path: '/api/api-keys/k1' },
];

describe('route map', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
  });

  for (const row of rows) {
    it(`${row.name} -> ${row.method} ${row.path}`, async () => {
      mockFetch.mockResolvedValueOnce(
        typeof row.response === 'string'
          ? { ok: true, status: 200, headers: new Headers({ 'content-type': 'text/csv' }), text: () => Promise.resolve(row.response) }
          : jsonResponse(row.response ?? {})
      );
      const result = await row.run(client);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [rawUrl, init] = mockFetch.mock.calls[0];
      const url = new URL(rawUrl as string);
      expect(init.method).toBe(row.method);
      expect(url.pathname).toBe(row.path);
      expect(Object.fromEntries(url.searchParams)).toEqual(row.query ?? {});
      if (row.body === undefined) {
        expect(init.body).toBeUndefined();
      } else {
        expect(JSON.parse(init.body as string)).toEqual(row.body);
      }
      row.check?.(result);
    });
  }

  describe('paging helpers', () => {
    it('page-based listAll walks every page (filters, routes, transforms, destinations)', async () => {
      const cases: Array<[string, (c: Hookbase) => AsyncGenerator<{ id: string }>, string]> = [
        ['filters', (c) => c.filters.listAll({ pageSize: 1 }), '/api/filters'],
        ['routes', (c) => c.routes.listAll({ pageSize: 1 }), '/api/routes'],
        ['transforms', (c) => c.transforms.listAll({ pageSize: 1 }), '/api/transforms'],
        ['destinations', (c) => c.destinations.listAll({ pageSize: 1 }), '/api/destinations'],
      ];
      for (const [key, iterate, path] of cases) {
        mockFetch.mockReset();
        mockFetch
          .mockResolvedValueOnce(jsonResponse({ [key]: [{ id: 'a' }], pagination: { total: 2, page: 1, pageSize: 1 } }))
          .mockResolvedValueOnce(jsonResponse({ [key]: [{ id: 'b' }], pagination: { total: 2, page: 2, pageSize: 1 } }));
        const ids: string[] = [];
        for await (const item of iterate(client)) ids.push(item.id);
        expect(ids).toEqual(['a', 'b']);
        const urls = mockFetch.mock.calls.map((c) => new URL(c[0] as string));
        expect(urls.map((u) => u.pathname)).toEqual([path, path]);
        expect(urls.map((u) => u.searchParams.get('page'))).toEqual(['1', '2']);
        expect(urls.map((u) => u.searchParams.get('pageSize'))).toEqual(['1', '1']);
      }
    });

    it('eventTypes.listAll follows the cursor', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'a' }], pagination: { hasMore: true, nextCursor: 'c1' } }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'b' }], pagination: { hasMore: false, nextCursor: null } }));
      const ids: string[] = [];
      for await (const et of client.eventTypes.listAll()) ids.push(et.id);
      expect(ids).toEqual(['a', 'b']);
      expect(new URL(mockFetch.mock.calls[1][0] as string).searchParams.get('cursor')).toBe('c1');
    });
  });

  describe('eventTypes by name', () => {
    it('getByName matches the exact name across pages of search results', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: '1', name: 'order.created.v2' }], pagination: { hasMore: true, nextCursor: 'c' } }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: '2', name: 'order.created' }], pagination: { hasMore: false, nextCursor: null } }));
      const et = await client.eventTypes.getByName('order.created');
      expect(et.id).toBe('2');
      expect(new URL(mockFetch.mock.calls[0][0] as string).searchParams.get('search')).toBe('order.created');
    });

    it('getByName throws HookbaseNotFoundError when nothing matches exactly', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [{ id: '1', name: 'order.created.v2' }], pagination: { hasMore: false, nextCursor: null } }));
      await expect(client.eventTypes.getByName('order.created')).rejects.toBeInstanceOf(HookbaseNotFoundError);
    });

    it('getOrCreate creates when the name is missing, and returns the existing one otherwise', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(cursorPage([])))
        .mockResolvedValueOnce(jsonResponse({ data: { id: 'new', name: 'a.b' } }, 201))
        .mockResolvedValueOnce(jsonResponse(cursorPage([{ id: 'old', name: 'a.b' }])));
      const created = await client.eventTypes.getOrCreate('a.b', { displayName: 'A B' });
      expect(created.id).toBe('new');
      expect(JSON.parse(mockFetch.mock.calls[1][1].body as string)).toEqual({ displayName: 'A B', name: 'a.b' });
      const existing = await client.eventTypes.getOrCreate('a.b', {});
      expect(existing.id).toBe('old');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('getOrCreate rethrows errors other than not-found', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 403));
      await expect(client.eventTypes.getOrCreate('a.b', {})).rejects.toMatchObject({ status: 403 });
    });
  });
});
