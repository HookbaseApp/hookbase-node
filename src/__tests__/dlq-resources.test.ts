import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';

describe('DLQ Resources', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new Hookbase({
      apiKey: 'test_api_key',
      fetch: mockFetch,
      retries: 0,
    });
  });

  function mockResponse(data: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Map(),
      json: () => Promise.resolve(data),
    };
  }

  describe('DlqResource', () => {
    it('should list DLQ messages with cursor-based pagination', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: [
          { id: 'msg_1', status: 'dlq', dlqReason: 'exhausted' },
          { id: 'msg_2', status: 'dlq', dlqReason: 'circuit_open' },
        ],
        pagination: { hasMore: true, nextCursor: '2024-01-01T00:00:00Z' },
      }));

      const result = await client.dlq.list({ limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/outbound-messages/dlq'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should get DLQ stats', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: {
          total: 42,
          byReason: { exhausted: 30, circuit_open: 12 },
          topFailingEndpoints: [
            { endpointId: 'ep_1', endpointUrl: 'https://failing.com/hook', count: 25 },
          ],
        },
      }));

      const result = await client.dlq.getStats();

      expect(result.total).toBe(42);
      expect(result.byReason.exhausted).toBe(30);
      expect(result.topFailingEndpoints).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/outbound-messages/dlq/stats'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should retry a single DLQ message', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: {
          originalMessageId: 'msg_1',
          newMessageId: 'msg_retry_1',
          status: 'pending',
        },
      }));

      const result = await client.dlq.retry('msg_1');

      expect(result.newMessageId).toBe('msg_retry_1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/outbound-messages/dlq/msg_1/retry'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should retry multiple DLQ messages', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: {
          total: 3,
          retried: 2,
          failed: 1,
          results: [
            { messageId: 'msg_1', status: 'retried', newMessageId: 'msg_r1' },
            { messageId: 'msg_2', status: 'retried', newMessageId: 'msg_r2' },
            { messageId: 'msg_3', status: 'error', error: 'Not found' },
          ],
        },
      }));

      const result = await client.dlq.retryBulk(['msg_1', 'msg_2', 'msg_3']);

      expect(result.retried).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results).toHaveLength(3);
    });

    it('should delete a DLQ message', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, headers: new Map(), json: () => Promise.resolve({ success: true }) });

      await client.dlq.delete('msg_1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/outbound-messages/dlq/msg_1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should bulk delete DLQ messages', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: { total: 3, deleted: 3 },
      }));

      const result = await client.dlq.deleteBulk(['msg_1', 'msg_2', 'msg_3']);

      expect(result.deleted).toBe(3);
    });

    it('should iterate through all DLQ messages', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: [{ id: 'msg_1' }, { id: 'msg_2' }],
        pagination: { hasMore: true, nextCursor: 'cursor_1' },
      }));
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: [{ id: 'msg_3' }],
        pagination: { hasMore: false, nextCursor: null },
      }));

      const items: { id: string }[] = [];
      for await (const msg of client.dlq.listAll({ limit: 2 })) {
        items.push(msg);
      }

      expect(items).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('MessagesResource extensions', () => {
    it('should get stats summary', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        data: {
          pending: 5,
          processing: 2,
          success: 100,
          failed: 10,
          exhausted: 3,
          dlq: 3,
          total: 123,
        },
      }));

      const result = await client.messages.getStatsSummary();

      expect(result.total).toBe(123);
      expect(result.success).toBe(100);
      expect(result.dlq).toBe(3);
    });

    it('should export outbound messages', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        events: [{ id: 'evt_1', eventType: 'order.created' }],
      }));

      const result = await client.messages.export({ format: 'json', type: 'events' });

      expect(result).toBeTruthy();
    });
  });

  describe('SubscriptionsResource extensions', () => {
    it('should bulk subscribe', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        created: 2,
        skipped: 1,
        subscriptions: [
          { id: 'sub_1', endpointId: 'ep_1', eventTypeId: 'evt_1' },
          { id: 'sub_2', endpointId: 'ep_1', eventTypeId: 'evt_2' },
        ],
      }));

      const result = await client.subscriptions.bulkSubscribe(
        'ep_1',
        ['evt_1', 'evt_2', 'evt_3']
      );

      expect(result.created).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.subscriptions).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/webhook-subscriptions/bulk'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
