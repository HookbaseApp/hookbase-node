import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';

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

/** Options the API accepts that the SDK used to have no way to send (api/src/routes/*). */
describe('outbound options', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
  });

  describe('messages.send', () => {
    it('sends labels, priority and eventVersion (send-event.ts sendEventSchema)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { eventId: 'e', messagesQueued: 0, endpoints: [] } }, 201));
      await client.messages.send('app_1', {
        eventType: 'order.created',
        payload: { id: 1 },
        labels: { region: 'eu' },
        priority: 1,
        eventVersion: 'v2',
      });
      const c = call(mockFetch);
      expect(c.method).toBe('POST');
      expect(c.url.pathname).toBe('/api/send-event');
      expect(c.body).toMatchObject({
        applicationId: 'app_1',
        eventType: 'order.created',
        labels: { region: 'eu' },
        priority: 1,
        eventVersion: 'v2',
      });
    });
  });

  describe('endpoints.rotateSecret', () => {
    const rotated = { secret: 'whsec_new', signatureScheme: 'hmac-sha256', previousSecretExpiresAt: null };

    it('sends gracePeriodSeconds when given', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(rotated));
      await client.endpoints.rotateSecret('app_1', 'ep_1', { gracePeriodSeconds: 0 });
      const c = call(mockFetch);
      expect(c.url.pathname).toBe('/api/webhook-endpoints/ep_1/rotate-secret');
      expect(c.body).toEqual({ gracePeriodSeconds: 0 });
    });

    it('still accepts RequestOptions as the third argument, sending no body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(rotated));
      await client.endpoints.rotateSecret('app_1', 'ep_1', { idempotencyKey: 'rot_1' });
      const c = call(mockFetch);
      expect(c.body).toBeUndefined();
      expect(c.headers['Idempotency-Key']).toBe('rot_1');
    });

    it('takes params and options together', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(rotated));
      await client.endpoints.rotateSecret('app_1', 'ep_1', { gracePeriodSeconds: 60 }, { idempotencyKey: 'rot_2' });
      const c = call(mockFetch);
      expect(c.body).toEqual({ gracePeriodSeconds: 60 });
      expect(c.headers['Idempotency-Key']).toBe('rot_2');
    });
  });

  describe('endpoints.test', () => {
    const result = {
      success: true,
      testEvent: { id: 'test_1', type: 'order.created', timestamp: '2026-10-23T00:00:00Z' },
      delivery: { status: 'success', responseStatus: 200, responseTimeMs: 12, responseBody: 'ok', errorMessage: null },
      signature: { header: 'webhook-signature', value: 'v1,abc', timestamp: 1 },
    };

    it('sends eventType and payload and returns the typed result', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(result));
      const res = await client.endpoints.test('app_1', 'ep_1', { eventType: 'order.created', payload: { a: 1 } });
      const c = call(mockFetch);
      expect(c.method).toBe('POST');
      expect(c.url.pathname).toBe('/api/webhook-endpoints/ep_1/test');
      expect(c.body).toEqual({ eventType: 'order.created', payload: { a: 1 } });
      expect(res.delivery.responseStatus).toBe(200);
      expect(res.testEvent.type).toBe('order.created');
    });

    it('sends no body without params', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(result));
      await client.endpoints.test('app_1', 'ep_1');
      expect(call(mockFetch).body).toBeUndefined();
    });
  });

  describe('subscriptions', () => {
    it('create sends the filter and routing fields', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'sub_1' } }, 201));
      await client.subscriptions.create('app_1', {
        endpointId: 'ep_1',
        eventTypeId: 'et_1',
        filterExpression: 'amount > 100',
        labelFilters: { region: ['eu', 'us'] },
        labelFilterMode: 'any',
        transformId: '7d6c0b8e-1f0e-4a43-9d5b-6b1a1f6f8a10',
        isEnabled: false,
        priorityOverride: 0,
        eventVersion: 'latest',
      });
      const c = call(mockFetch);
      expect(c.url.pathname).toBe('/api/webhook-subscriptions');
      expect(c.body).toEqual({
        endpointId: 'ep_1',
        eventTypeId: 'et_1',
        filterExpression: 'amount > 100',
        labelFilters: { region: ['eu', 'us'] },
        labelFilterMode: 'any',
        transformId: '7d6c0b8e-1f0e-4a43-9d5b-6b1a1f6f8a10',
        isEnabled: false,
        priorityOverride: 0,
        eventVersion: 'latest',
      });
    });

    it('update can clear fields with null', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'sub_1' } }));
      await client.subscriptions.update('app_1', 'sub_1', { filterExpression: null, transformId: null });
      const c = call(mockFetch);
      expect(c.method).toBe('PATCH');
      expect(c.url.pathname).toBe('/api/webhook-subscriptions/sub_1');
      expect(c.body).toEqual({ filterExpression: null, transformId: null });
    });

    it('get copies the nested eventType.name to eventTypeName', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'sub_1',
            endpointId: 'ep_1',
            eventTypeId: 'et_1',
            isEnabled: true,
            createdAt: '2026-10-23T00:00:00Z',
            endpoint: { id: 'ep_1', url: 'https://x.example' },
            eventType: { id: 'et_1', name: 'order.created', displayName: null },
            application: { id: 'app_1', name: 'A' },
          },
        })
      );
      const sub = await client.subscriptions.get('app_1', 'sub_1');
      expect(sub.eventTypeName).toBe('order.created');
      expect(sub.endpoint?.url).toBe('https://x.example');
    });

    it('bulkSubscribe and subscribeToMany send the shared filter options', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ created: 2, skipped: 0, subscriptions: [] }, 201));
      await client.subscriptions.bulkSubscribe('ep_1', ['et_1', 'et_2'], undefined, {
        labelFilters: { tier: 'gold' },
        eventVersion: 'latest',
      });
      await client.subscriptions.subscribeToMany('app_1', 'ep_1', ['et_1'], undefined, { filterExpression: 'x' });
      expect(call(mockFetch, 0).url.pathname).toBe('/api/webhook-subscriptions/bulk');
      expect(call(mockFetch, 0).body).toEqual({
        labelFilters: { tier: 'gold' },
        eventVersion: 'latest',
        endpointId: 'ep_1',
        eventTypeIds: ['et_1', 'et_2'],
      });
      expect(call(mockFetch, 1).body).toEqual({ filterExpression: 'x', endpointId: 'ep_1', eventTypeIds: ['et_1'] });
    });
  });

  describe('eventTypes examplePayload encoding', () => {
    it('JSON-encodes every non-string example, including 0 and false', async () => {
      for (const example of [0, false, 42, [1, 2], { a: 1 }, {}]) {
        mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'et_1' } }, 201));
        await client.eventTypes.create({ name: 'a.b', examplePayload: example });
        const body = call(mockFetch, mockFetch.mock.calls.length - 1).body;
        expect(body.examplePayload).toBe(JSON.stringify(example));
      }
    });

    it('passes a string through as already-encoded JSON, and null through to clear it', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ data: { id: 'et_1' } }));
      await client.eventTypes.update('et_1', { examplePayload: '{"a":1}' });
      await client.eventTypes.update('et_1', { examplePayload: null });
      expect(call(mockFetch, 0).body.examplePayload).toBe('{"a":1}');
      expect(call(mockFetch, 1).body.examplePayload).toBeNull();
    });
  });

  describe('portalTokens', () => {
    it('fills applicationId on create and list (the API omits it)', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ data: { id: 'pt_1', token: 'whpt_x', scopes: ['read'], expiresAt: 'x', createdAt: 'y' } }, 201))
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'pt_1', scopes: ['read'], expiresAt: 'x', createdAt: 'y', useCount: 3 }] }));
      const created = await client.portalTokens.create('app_1', { expiresInDays: 7 });
      const listed = await client.portalTokens.list('app_1');
      expect(created.applicationId).toBe('app_1');
      expect(listed[0].applicationId).toBe('app_1');
      expect(listed[0].useCount).toBe(3);
      expect(call(mockFetch, 0).url.pathname).toBe('/api/portal/webhook-applications/app_1/tokens');
      expect(call(mockFetch, 0).body).toEqual({ expiresInDays: 7 });
    });
  });

  describe('path encoding', () => {
    it('URL-encodes ids in outbound resource paths', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ data: { id: 'x', headers: [] } }));
      await client.applications.get('a/b');
      await client.endpoints.get('app', 'e?x');
      await client.subscriptions.get('app', 's#1');
      await client.eventTypes.get('t/1');
      await client.portalTokens.revoke('a/1', 'p/1');
      const urls = mockFetch.mock.calls.map((c) => c[0] as string);
      expect(urls[0]).toMatch(/\/api\/webhook-applications\/a%2Fb$/);
      expect(urls[1]).toMatch(/\/api\/webhook-endpoints\/e%3Fx$/);
      expect(urls[2]).toMatch(/\/api\/webhook-subscriptions\/s%231$/);
      expect(urls[3]).toMatch(/\/api\/event-types\/t%2F1$/);
      expect(urls[4]).toMatch(/\/api\/portal\/tokens\/p%2F1$/);
    });
  });
});
