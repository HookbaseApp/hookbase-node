import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';
import type { MessageStatus } from '../types';

/**
 * The outbound surface checked against the API routes it calls (api/src/routes/send-event.ts,
 * outbound-messages.ts, webhook-endpoints.ts, webhook-subscriptions.ts, event-types.ts). Every
 * mocked response below is the shape those routes build, field for field.
 */

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map([['content-type', 'application/json; charset=UTF-8']]),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

function errorResponse(status: number, body: unknown = { error: 'boom' }) {
  return {
    ok: false,
    status,
    headers: new Map<string, string>(),
    json: () => Promise.resolve(body),
  };
}

const sendResult = {
  data: {
    eventId: 'evt_1',
    messagesQueued: 2,
    endpoints: [
      { id: 'ep_1', url: 'https://a.example/hook' },
      { id: 'ep_2', url: 'https://b.example/hook' },
    ],
  },
};

function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse((call[1] as { body: string }).body);
}
function headersOf(call: unknown[]): Record<string, string> {
  return (call[1] as { headers: Record<string, string> }).headers;
}
function urlOf(call: unknown[]): URL {
  return new URL(call[0] as string);
}

describe('outbound contract', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new Hookbase({ apiKey: 'test_api_key', fetch: mockFetch, retries: 0 });
  });

  describe('messages.send', () => {
    it('sends endpointIds plus the singular endpointId when there is one target', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(sendResult, 201));

      await client.messages.send('app_1', {
        eventType: 'order.created',
        payload: { id: 1 },
        endpointIds: ['ep_1'],
      });

      const call = mockFetch.mock.calls[0];
      expect(urlOf(call).pathname).toBe('/api/send-event');
      const body = bodyOf(call);
      expect(body.endpointIds).toEqual(['ep_1']);
      expect(body.endpointId).toBe('ep_1');
      expect(body.applicationId).toBe('app_1');
      expect(body.eventType).toBe('order.created');
      expect(body.payload).toEqual({ id: 1 });
    });

    it('sends only endpointIds for several targets, merging and de-duplicating endpointId', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(sendResult, 201));

      await client.messages.send('app_1', {
        eventType: 'order.created',
        payload: {},
        endpointIds: ['ep_1', 'ep_2'],
        endpointId: 'ep_1',
      });

      const body = bodyOf(mockFetch.mock.calls[0]);
      expect(body.endpointIds).toEqual(['ep_1', 'ep_2']);
      expect(body).not.toHaveProperty('endpointId');
    });

    it('sends no targeting fields when none are given, and never the unaccepted eventId', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(sendResult, 201));

      await client.messages.send('app_1', { eventType: 'x', payload: {}, eventId: 'mine' });

      const body = bodyOf(mockFetch.mock.calls[0]);
      expect(body).not.toHaveProperty('endpointIds');
      expect(body).not.toHaveProperty('endpointId');
      expect(body).not.toHaveProperty('eventId');
    });

    it('puts the caller key in both the body and the Idempotency-Key header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(sendResult, 201));

      await client.messages.send('app_1', { eventType: 'x', payload: {} }, { idempotencyKey: 'key_1' });

      const call = mockFetch.mock.calls[0];
      expect(bodyOf(call).idempotencyKey).toBe('key_1');
      expect(headersOf(call)['Idempotency-Key']).toBe('key_1');
    });

    it('prefers data.idempotencyKey over the request option', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(sendResult, 201));

      await client.messages.send(
        'app_1',
        { eventType: 'x', payload: {}, idempotencyKey: 'body_key' },
        { idempotencyKey: 'option_key' }
      );

      const call = mockFetch.mock.calls[0];
      expect(bodyOf(call).idempotencyKey).toBe('body_key');
      expect(headersOf(call)['Idempotency-Key']).toBe('body_key');
    });

    it('generates one key per call and reuses it on every retry', async () => {
      vi.useFakeTimers();
      try {
        const retrying = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 2 });
        mockFetch
          .mockResolvedValueOnce(errorResponse(503))
          .mockRejectedValueOnce(new Error('socket hang up'))
          .mockResolvedValueOnce(jsonResponse(sendResult, 201));

        const pending = retrying.messages.send('app_1', { eventType: 'x', payload: {} });
        await vi.runAllTimersAsync();
        await pending;

        expect(mockFetch).toHaveBeenCalledTimes(3);
        const keys = mockFetch.mock.calls.map((c) => bodyOf(c).idempotencyKey);
        const headerKeys = mockFetch.mock.calls.map((c) => headersOf(c)['Idempotency-Key']);
        expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
        expect(new Set(keys).size).toBe(1);
        expect(headerKeys).toEqual(keys);

        // A second logical send gets a different key.
        mockFetch.mockResolvedValueOnce(jsonResponse(sendResult, 201));
        await retrying.messages.send('app_1', { eventType: 'x', payload: {} });
        expect(bodyOf(mockFetch.mock.calls[3]).idempotencyKey).not.toBe(keys[0]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns the API fields, with the old names mirrored', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(sendResult, 201));

      const result = await client.messages.send('app_1', { eventType: 'x', payload: {} });

      expect(result.eventId).toBe('evt_1');
      expect(result.messagesQueued).toBe(2);
      expect(result.endpoints).toEqual(sendResult.data.endpoints);
      expect(result.messageId).toBe('evt_1');
      expect(result.outboundMessages.map((m) => m.endpointId)).toEqual(['ep_1', 'ep_2']);
    });
  });

  describe('retry policy', () => {
    it('does not retry a POST without an idempotency key after a 5xx', async () => {
      const retrying = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 3 });
      mockFetch.mockResolvedValueOnce(errorResponse(502));

      await expect(retrying.endpoints.rotateSecret('app_1', 'ep_1')).rejects.toMatchObject({ status: 502 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry a POST without an idempotency key after a network error', async () => {
      const retrying = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 3 });
      mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));

      await expect(retrying.messages.retry('app_1', 'msg_1')).rejects.toThrow('ECONNRESET');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('still retries a POST when the caller asks for retries explicitly', async () => {
      vi.useFakeTimers();
      try {
        const retrying = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
        mockFetch
          .mockResolvedValueOnce(errorResponse(503))
          .mockResolvedValueOnce(jsonResponse({ data: { originalMessageId: 'a', newMessageId: 'b', status: 'queued' } }, 201));

        const pending = retrying.dlq.retry('a', { retries: 1 });
        await vi.runAllTimersAsync();
        await expect(pending).resolves.toMatchObject({ newMessageId: 'b' });
        expect(mockFetch).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('still retries GETs after a 5xx', async () => {
      vi.useFakeTimers();
      try {
        const retrying = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 1 });
        mockFetch
          .mockResolvedValueOnce(errorResponse(500))
          .mockResolvedValueOnce(jsonResponse({ data: { id: 'ep_1', headers: [] } }));

        const pending = retrying.endpoints.get('app_1', 'ep_1');
        await vi.runAllTimersAsync();
        await expect(pending).resolves.toMatchObject({ id: 'ep_1' });
        expect(mockFetch).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not retry a 4xx such as 409 or 413', async () => {
      const retrying = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 3 });
      mockFetch.mockResolvedValueOnce(errorResponse(413, { error: 'Payload too large' }));

      await expect(
        retrying.messages.send('app_1', { eventType: 'x', payload: {} })
      ).rejects.toMatchObject({ status: 413 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('pagination', () => {
    it('lets list() reach page two by passing the cursor back verbatim', async () => {
      const opaque = 'eyJ0cyI6IjIwMjYtMTAtMTdUMDA6MDA6MDAuMDAwMDAxWiIsImlkIjoibXNnXzIifQ';
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'msg_1', eventId: 'evt_1', lastErrorMessage: null }],
        pagination: { hasMore: true, nextCursor: opaque },
      }));
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'msg_2', eventId: 'evt_2', lastErrorMessage: null }],
        pagination: { hasMore: false, nextCursor: null },
      }));

      const first = await client.messages.list('app_1', { limit: 1, status: 'failed' });
      expect(first.hasMore).toBe(true);
      expect(first.cursor).toBe(opaque);

      const second = await client.messages.list('app_1', { limit: 1, status: 'failed', cursor: first.cursor! });
      expect(second.data[0].id).toBe('msg_2');
      expect(second.hasMore).toBe(false);
      expect(second.cursor).toBeNull();

      const url = urlOf(mockFetch.mock.calls[1]);
      expect(url.pathname).toBe('/api/outbound-messages');
      expect(url.searchParams.get('cursor')).toBe(opaque);
      expect(url.searchParams.get('applicationId')).toBe('app_1');
      expect(url.searchParams.get('status')).toBe('failed');
      expect(url.searchParams.has('offset')).toBe(false);
    });

    it.each([
      ['applications', (c: Hookbase) => c.applications.listAll(), '/api/webhook-applications'],
      ['endpoints', (c: Hookbase) => c.endpoints.listAll('app_1'), '/api/webhook-endpoints'],
      ['event types', (c: Hookbase) => c.eventTypes.listAll(), '/api/event-types'],
      ['subscriptions', (c: Hookbase) => c.subscriptions.listAll('app_1'), '/api/webhook-subscriptions'],
      ['messages', (c: Hookbase) => c.messages.listAll('app_1'), '/api/outbound-messages'],
      ['dlq', (c: Hookbase) => c.dlq.listAll(), '/api/outbound-messages/dlq/messages'],
    ] as const)('%s listAll follows nextCursor across pages', async (_name, iterate, path) => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'a', headers: [] }],
        pagination: { hasMore: true, nextCursor: 'c/1+=' },
      }));
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'b', headers: [] }],
        pagination: { hasMore: false, nextCursor: null },
      }));

      const ids: string[] = [];
      for await (const item of iterate(client) as AsyncGenerator<{ id: string }>) ids.push(item.id);

      expect(ids).toEqual(['a', 'b']);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(urlOf(mockFetch.mock.calls[0]).pathname).toBe(path);
      expect(urlOf(mockFetch.mock.calls[0]).searchParams.has('cursor')).toBe(false);
      expect(urlOf(mockFetch.mock.calls[1]).searchParams.get('cursor')).toBe('c/1+=');
    });

    it('stops when hasMore is true but no cursor came back, instead of looping on page one', async () => {
      mockFetch.mockResolvedValue(jsonResponse({
        data: [{ id: 'a' }],
        pagination: { hasMore: true, nextCursor: null },
      }));

      const ids: string[] = [];
      for await (const item of client.eventTypes.listAll()) ids.push(item.id);

      expect(ids).toEqual(['a']);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('eventTypes.getByName finds an exact name past the first page of search results', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'et_1', name: 'order.created' }],
        pagination: { hasMore: true, nextCursor: 'next' },
      }));
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'et_2', name: 'order' }],
        pagination: { hasMore: false, nextCursor: null },
      }));

      const et = await client.eventTypes.getByName('order');

      expect(et.id).toBe('et_2');
      expect(urlOf(mockFetch.mock.calls[0]).searchParams.get('search')).toBe('order');
    });

    it('subscriptions.unsubscribeAll deletes subscriptions on every page', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'sub_1' }],
        pagination: { hasMore: true, nextCursor: 'next' },
      }));
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [{ id: 'sub_2' }],
        pagination: { hasMore: false, nextCursor: null },
      }));
      mockFetch.mockResolvedValue({ ok: true, status: 204, headers: new Map(), json: () => Promise.resolve(undefined) });

      await client.subscriptions.unsubscribeAll('app_1', 'ep_1');

      const deletes = mockFetch.mock.calls.filter((c) => (c[1] as { method: string }).method === 'DELETE');
      expect(deletes.map((c) => urlOf(c).pathname)).toEqual([
        '/api/webhook-subscriptions/sub_1',
        '/api/webhook-subscriptions/sub_2',
      ]);
      expect(urlOf(mockFetch.mock.calls[0]).searchParams.get('endpointId')).toBe('ep_1');
    });
  });

  describe('message, attempt and DLQ field names', () => {
    it('maps a message as GET /outbound-messages/:id sends it', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: {
          id: 'msg_1',
          eventId: 'evt_1',
          eventType: 'order.created',
          applicationId: 'app_1',
          endpointId: 'ep_1',
          status: 'awaiting_retry',
          attempts: 2,
          maxAttempts: 5,
          lastResponseStatus: 503,
          lastErrorType: 'http_error',
          lastErrorMessage: 'Service Unavailable',
          createdAt: '2026-10-17T00:00:00Z',
          completedAt: null,
          endpointUrl: 'https://a.example/hook',
          payload: { id: 1 },
        },
      }));

      const msg = await client.messages.get('app_1', 'msg_1');

      expect(urlOf(mockFetch.mock.calls[0]).pathname).toBe('/api/outbound-messages/msg_1');
      expect(msg.eventId).toBe('evt_1');
      expect(msg.lastErrorMessage).toBe('Service Unavailable');
      expect(msg.status).toBe('awaiting_retry');
      expect(msg.messageId).toBe('evt_1');
      expect(msg.lastError).toBe('Service Unavailable');
      expect(msg.updatedAt).toBeNull();
      expect(msg.deliveredAt).toBeNull();
    });

    it('accepts every status the API uses', () => {
      const statuses: MessageStatus[] = [
        'pending', 'processing', 'success', 'failed', 'awaiting_retry', 'exhausted', 'dlq',
      ];
      expect(statuses).toHaveLength(7);
    });

    it('maps attempts as GET /outbound-messages/:id/attempts sends them', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [{
          id: 'att_1',
          messageId: 'msg_1',
          attemptNumber: 1,
          status: 'failed',
          responseStatus: 500,
          responseHeaders: {},
          responseBody: 'oops',
          responseTimeMs: 120,
          totalTimeMs: 130,
          errorType: 'http_error',
          errorMessage: 'HTTP 500',
          errorCode: null,
          requestUrl: 'https://a.example/hook',
          requestHeaders: {},
          requestBodySize: 10,
          triggeredBy: 'system',
          triggeredByUser: null,
          createdAt: '2026-10-17T00:00:00Z',
          completedAt: '2026-10-17T00:00:01Z',
        }],
      }));

      const [attempt] = await client.messages.listAttempts('app_1', 'msg_1');

      expect(urlOf(mockFetch.mock.calls[0]).pathname).toBe('/api/outbound-messages/msg_1/attempts');
      expect(attempt.responseTimeMs).toBe(120);
      expect(attempt.errorMessage).toBe('HTTP 500');
      expect(attempt.latencyMs).toBe(120);
      expect(attempt.error).toBe('HTTP 500');
      expect(attempt.attemptedAt).toBe('2026-10-17T00:00:00Z');
      expect(attempt.outboundMessageId).toBe('msg_1');
    });

    it('maps DLQ items and sends the reason filter as `reason`', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [{
          id: 'msg_1',
          eventId: 'evt_1',
          status: 'dlq',
          lastErrorType: 'timeout',
          lastErrorMessage: 'timed out',
          dlqReason: 'max_retries_exceeded',
          dlqMovedAt: '2026-10-17T00:00:00Z',
          dlqRetryCount: 1,
          dlqLastRetryAt: null,
          completedAt: null,
        }],
        pagination: { hasMore: false, nextCursor: null },
      }));

      const page = await client.dlq.list({ dlqReason: 'max_retries_exceeded', startDate: '2026-10-01T00:00:00Z' });

      const url = urlOf(mockFetch.mock.calls[0]);
      expect(url.searchParams.get('reason')).toBe('max_retries_exceeded');
      expect(url.searchParams.has('dlqReason')).toBe(false);
      expect(url.searchParams.get('startDate')).toBe('2026-10-01T00:00:00Z');
      const item = page.data[0];
      expect(item.eventId).toBe('evt_1');
      expect(item.lastErrorMessage).toBe('timed out');
      expect(item.messageId).toBe('evt_1');
      expect(item.lastError).toBe('timed out');
    });

    it('reports awaitingRetry in the stats summary', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { pending: 1, processing: 0, success: 5, failed: 0, awaitingRetry: 2, exhausted: 0, dlq: 1, total: 9 },
      }));

      const stats = await client.messages.getStatsSummary();

      expect(stats.awaitingRetry).toBe(2);
    });

    it('returns the replay result the API sends', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(
        { data: { originalMessageId: 'msg_1', newMessageId: 'msg_2', status: 'queued' } },
        201
      ));

      const result = await client.messages.retry('app_1', 'msg_1');

      expect(urlOf(mockFetch.mock.calls[0]).pathname).toBe('/api/outbound-messages/msg_1/replay');
      expect(result.id).toBe('msg_2');
      expect(result.newMessageId).toBe('msg_2');
      expect(result.originalMessageId).toBe('msg_1');
    });
  });

  describe('endpoints.rotateSecret', () => {
    it('returns secret, previousSecretExpiresAt and secretVersion', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        secret: 'whsec_bmV3',
        previousSecretExpiresAt: '2026-10-17T01:00:00Z',
        secretVersion: 3,
      }));

      const result = await client.endpoints.rotateSecret('app_1', 'ep_1');

      expect(urlOf(mockFetch.mock.calls[0]).pathname).toBe('/api/webhook-endpoints/ep_1/rotate-secret');
      expect(result).toEqual({
        secret: 'whsec_bmV3',
        previousSecretExpiresAt: '2026-10-17T01:00:00Z',
        secretVersion: 3,
      });
    });

    it('returns the new and previous public keys, and no secret, for an ed25519 endpoint', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        signatureScheme: 'ed25519',
        publicKey: 'whpk_new',
        previousPublicKey: 'whpk_old',
        previousSecretExpiresAt: '2026-10-17T01:00:00Z',
        secretVersion: 4,
      }));

      const result = await client.endpoints.rotateSecret('app_1', 'ep_1');

      expect(result.signatureScheme).toBe('ed25519');
      if (result.signatureScheme !== 'ed25519') throw new Error('expected the ed25519 shape');
      expect(result.publicKey).toBe('whpk_new');
      expect(result.previousPublicKey).toBe('whpk_old');
      expect(result.secret).toBeUndefined();
      expect(result.secretVersion).toBe(4);
    });
  });

  describe('messages.export', () => {
    it('returns CSV as text instead of failing to parse it as JSON', async () => {
      const csv = 'id,eventType\nevt_1,"order.created"';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/csv']]),
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
        text: () => Promise.resolve(csv),
      });

      const result = await client.messages.export({ format: 'csv', type: 'events' });

      expect(result).toBe(csv);
      const url = urlOf(mockFetch.mock.calls[0]);
      expect(url.pathname).toBe('/api/outbound-messages/export');
      expect(url.searchParams.get('format')).toBe('csv');
    });

    it('returns the parsed JSON export', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        exportedAt: '2026-10-17T00:00:00Z',
        organization: 'acme',
        count: 1,
        messages: [{ id: 'msg_1', eventId: 'evt_1' }],
      }));

      const result = await client.messages.export({ type: 'messages' });

      expect(result.count).toBe(1);
      expect(result.messages?.[0].eventId).toBe('evt_1');
    });
  });

  describe('subscriptions bulk', () => {
    it('returns an empty list when every event type was already subscribed', async () => {
      // The API's answer in that case has no `subscriptions` key.
      mockFetch.mockResolvedValue(jsonResponse({
        created: 0,
        skipped: 2,
        message: 'All event types are already subscribed',
      }));

      await expect(client.subscriptions.subscribeToMany('app_1', 'ep_1', ['et_1', 'et_2'])).resolves.toEqual([]);
      const full = await client.subscriptions.bulkSubscribe('ep_1', ['et_1', 'et_2']);
      expect(full.subscriptions).toEqual([]);
      expect(full.skipped).toBe(2);
    });
  });

  describe('event types', () => {
    it('sends the newer create fields, with examplePayload as the JSON string the API takes', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'et_1', name: 'order.created' } }, 201));

      await client.eventTypes.create({
        name: 'order.created',
        examplePayload: { id: 1 },
        documentationUrl: 'https://docs.example/order',
        defaultPriority: 1,
        isEnabled: false,
      });

      expect(bodyOf(mockFetch.mock.calls[0])).toEqual({
        name: 'order.created',
        examplePayload: '{"id":1}',
        documentationUrl: 'https://docs.example/order',
        defaultPriority: 1,
        isEnabled: false,
      });
    });
  });
});
