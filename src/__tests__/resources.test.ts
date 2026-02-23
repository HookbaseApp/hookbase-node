import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';

describe('Resource Methods', () => {
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

  describe('ApplicationsResource', () => {
    it('should list applications', async () => {
      const mockData = {
        data: [{ id: 'app_1', name: 'App 1' }],
        total: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve(mockData),
      });

      const result = await client.applications.list();

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should get application by ID', async () => {
      const mockApp = { id: 'app_123', name: 'Test App' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockApp }),
      });

      const result = await client.applications.get('app_123');

      expect(result.id).toBe('app_123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/applications/app_123'),
        expect.any(Object)
      );
    });

    it('should get application by UID', async () => {
      const mockApp = { id: 'app_123', name: 'Test App', uid: 'customer_123' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockApp }),
      });

      const result = await client.applications.getByUid('customer_123');

      expect(result.uid).toBe('customer_123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/applications/uid/customer_123'),
        expect.any(Object)
      );
    });

    it('should create application', async () => {
      const mockApp = { id: 'app_123', name: 'New App' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockApp }),
      });

      const result = await client.applications.create({ name: 'New App' });

      expect(result.name).toBe('New App');
    });

    it('should update application', async () => {
      const mockApp = { id: 'app_123', name: 'Updated App' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockApp }),
      });

      const result = await client.applications.update('app_123', {
        name: 'Updated App',
      });

      expect(result.name).toBe('Updated App');
    });

    it('should delete application', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Map(),
      });

      await client.applications.delete('app_123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/applications/app_123'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should getOrCreate - get existing', async () => {
      const mockApp = { id: 'app_123', name: 'Existing', uid: 'uid_123' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockApp }),
      });

      const result = await client.applications.getOrCreate('uid_123', {
        name: 'New App',
      });

      expect(result.name).toBe('Existing');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should getOrCreate - create new', async () => {
      const mockApp = { id: 'app_123', name: 'New App', uid: 'uid_123' };

      // First call returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Map(),
        json: () => Promise.resolve({ error: { message: 'Not found' } }),
      });

      // Second call creates
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockApp }),
      });

      const result = await client.applications.getOrCreate('uid_123', {
        name: 'New App',
      });

      expect(result.name).toBe('New App');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('EndpointsResource', () => {
    it('should list endpoints', async () => {
      const mockData = {
        data: [{ id: 'ep_1', url: 'https://example.com/webhooks' }],
        total: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve(mockData),
      });

      const result = await client.endpoints.list('app_123');

      expect(result.data).toHaveLength(1);
    });

    it('should create endpoint with secret', async () => {
      const mockEndpoint = {
        id: 'ep_123',
        url: 'https://example.com/webhooks',
        secret: 'whsec_test_secret',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockEndpoint }),
      });

      const result = await client.endpoints.create('app_123', {
        url: 'https://example.com/webhooks',
      });

      expect(result.secret).toBe('whsec_test_secret');
    });

    it('should rotate secret', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: { secret: 'whsec_new_secret' } }),
      });

      const result = await client.endpoints.rotateSecret('app_123', 'ep_123');

      expect(result.secret).toBe('whsec_new_secret');
    });

    it('should enable endpoint', async () => {
      const mockEndpoint = { id: 'ep_123', isDisabled: false };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockEndpoint }),
      });

      const result = await client.endpoints.enable('app_123', 'ep_123');

      expect(result.isDisabled).toBe(false);
    });

    it('should disable endpoint', async () => {
      const mockEndpoint = { id: 'ep_123', isDisabled: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockEndpoint }),
      });

      const result = await client.endpoints.disable('app_123', 'ep_123');

      expect(result.isDisabled).toBe(true);
    });
  });

  describe('MessagesResource', () => {
    it('should send message', async () => {
      const mockResult = {
        messageId: 'msg_123',
        outboundMessages: [{ id: 'out_1', endpointId: 'ep_1', status: 'pending' }],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockResult }),
      });

      const result = await client.messages.send('app_123', {
        eventType: 'order.created',
        payload: { orderId: 'ord_123' },
      });

      expect(result.messageId).toBe('msg_123');
      expect(result.outboundMessages).toHaveLength(1);
    });

    it('should retry failed message', async () => {
      const mockOutbound = { id: 'out_123', status: 'pending', attempts: 2 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockOutbound }),
      });

      const result = await client.messages.retry('app_123', 'out_123');

      expect(result.status).toBe('pending');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/outbound-messages/out_123/retry'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('SubscriptionsResource', () => {
    it('should subscribe to multiple event types', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Map(),
          json: () =>
            Promise.resolve({ data: { id: 'sub_1', eventTypeId: 'evt_1' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Map(),
          json: () =>
            Promise.resolve({ data: { id: 'sub_2', eventTypeId: 'evt_2' } }),
        });

      const result = await client.subscriptions.subscribeToMany(
        'app_123',
        'ep_123',
        ['evt_1', 'evt_2']
      );

      expect(result).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should unsubscribe from all', async () => {
      // First call: list subscriptions
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () =>
          Promise.resolve({
            data: [
              { id: 'sub_1', endpointId: 'ep_123' },
              { id: 'sub_2', endpointId: 'ep_123' },
            ],
            total: 2,
            limit: 50,
            offset: 0,
            hasMore: false,
          }),
      });

      // Delete calls
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, headers: new Map() });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, headers: new Map() });

      await client.subscriptions.unsubscribeAll('app_123', 'ep_123');

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('PortalTokensResource', () => {
    it('should create portal token', async () => {
      const mockToken = {
        id: 'ptk_123',
        token: 'whpt_test_token',
        expiresAt: '2024-01-01T01:00:00Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockToken }),
      });

      const result = await client.portalTokens.create('app_123', {
        expiresInDays: 30,
      });

      expect(result.token).toBe('whpt_test_token');
    });

    it('should revoke portal token', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, headers: new Map() });

      await client.portalTokens.revoke('app_123', 'ptk_123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/portal-tokens/ptk_123'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('Async Iterator Pagination', () => {
    it('should iterate through all pages', async () => {
      // First page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () =>
          Promise.resolve({
            data: [{ id: 'app_1' }, { id: 'app_2' }],
            total: 4,
            limit: 2,
            offset: 0,
            hasMore: true,
          }),
      });

      // Second page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () =>
          Promise.resolve({
            data: [{ id: 'app_3' }, { id: 'app_4' }],
            total: 4,
            limit: 2,
            offset: 2,
            hasMore: false,
          }),
      });

      const apps: { id: string }[] = [];
      for await (const app of client.applications.listAll({ limit: 2 })) {
        apps.push(app);
      }

      expect(apps).toHaveLength(4);
      expect(apps.map((a) => a.id)).toEqual(['app_1', 'app_2', 'app_3', 'app_4']);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
