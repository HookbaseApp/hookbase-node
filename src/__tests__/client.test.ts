import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hookbase, createClient } from '../client';
import {
  HookbaseApiError,
  HookbaseAuthenticationError,
  HookbaseNotFoundError,
  HookbaseRateLimitError,
  HookbaseValidationError,
  HookbaseTimeoutError,
} from '../errors';

describe('Hookbase Client', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create client with required options', () => {
      const client = new Hookbase({
        apiKey: 'test_api_key',
        fetch: mockFetch,
      });

      expect(client).toBeInstanceOf(Hookbase);
      expect(client.applications).toBeDefined();
      expect(client.endpoints).toBeDefined();
      expect(client.eventTypes).toBeDefined();
      expect(client.subscriptions).toBeDefined();
      expect(client.messages).toBeDefined();
      expect(client.portalTokens).toBeDefined();
    });

    it('should throw error without API key', () => {
      expect(() => new Hookbase({ apiKey: '' })).toThrow('API key is required');
    });

    it('should use default base URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: [] }),
      });

      const client = new Hookbase({
        apiKey: 'test_api_key',
        fetch: mockFetch,
      });

      await client.applications.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.hookbase.app'),
        expect.any(Object)
      );
    });

    it('should use custom base URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: [] }),
      });

      const client = new Hookbase({
        apiKey: 'test_api_key',
        baseUrl: 'https://custom.api.com',
        fetch: mockFetch,
      });

      await client.applications.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://custom.api.com'),
        expect.any(Object)
      );
    });
  });

  describe('createClient factory', () => {
    it('should create client instance', () => {
      const client = createClient({
        apiKey: 'test_api_key',
        fetch: mockFetch,
      });

      expect(client).toBeInstanceOf(Hookbase);
    });
  });

  describe('request handling', () => {
    let client: Hookbase;

    beforeEach(() => {
      client = new Hookbase({
        apiKey: 'test_api_key',
        fetch: mockFetch,
        retries: 0,
      });
    });

    it('should send authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: { id: 'app_123' } }),
      });

      await client.applications.get('app_123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test_api_key',
          }),
        })
      );
    });

    it('should handle successful GET request', async () => {
      const mockData = { id: 'app_123', name: 'Test App' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockData }),
      });

      const result = await client.applications.get('app_123');

      expect(result).toEqual(mockData);
    });

    it('should handle successful POST request', async () => {
      const mockData = { id: 'app_123', name: 'Test App' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Map(),
        json: () => Promise.resolve({ data: mockData }),
      });

      const result = await client.applications.create({ name: 'Test App' });

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test App' }),
        })
      );
    });

    it('should handle 204 No Content response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Map(),
      });

      await client.applications.delete('app_123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/webhook-applications/app_123'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should include query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: [], pagination: { hasMore: false, nextCursor: null } }),
      });

      await client.applications.list({ limit: 10, offset: 20 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=20'),
        expect.any(Object)
      );
    });
  });

  describe('error handling', () => {
    let client: Hookbase;

    beforeEach(() => {
      client = new Hookbase({
        apiKey: 'test_api_key',
        fetch: mockFetch,
        retries: 0,
      });
    });

    it('should throw HookbaseAuthenticationError on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Map([['x-request-id', 'req_123']]),
        json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
      });

      await expect(client.applications.get('app_123')).rejects.toThrow(
        HookbaseAuthenticationError
      );
    });

    it('should throw HookbaseNotFoundError on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Map(),
        json: () => Promise.resolve({ error: { message: 'Not found' } }),
      });

      await expect(client.applications.get('app_123')).rejects.toThrow(
        HookbaseNotFoundError
      );
    });

    it('should throw HookbaseValidationError on 400', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Map(),
        json: () =>
          Promise.resolve({
            error: {
              message: 'Validation failed',
              validationErrors: { name: ['Required'] },
            },
          }),
      });

      await expect(client.applications.create({ name: '' })).rejects.toThrow(
        HookbaseValidationError
      );
    });

    it('should throw HookbaseRateLimitError on 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Map([['retry-after', '60']]),
        json: () => Promise.resolve({ error: { message: 'Rate limited' } }),
      });

      const error = await client.applications.get('app_123').catch((e) => e);

      expect(error).toBeInstanceOf(HookbaseRateLimitError);
      expect(error.retryAfter).toBe(60);
    });

    it('should throw HookbaseApiError on other errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Map(),
        json: () => Promise.resolve({ error: { message: 'Server error' } }),
      });

      await expect(client.applications.get('app_123')).rejects.toThrow(
        HookbaseApiError
      );
    });
  });

  // Hookbase actually sends `error` as a plain string (`{ error: "...", code: "...",
  // details?: {...} }`), not the `{ error: { message, code } }` shape every test above mocks.
  // That mismatch is exactly how the original bug shipped unnoticed: the tests never exercised
  // the real response shape, so a parser that only worked against a shape the API never sends
  // still passed every one of them.
  describe('error handling against the real (string error) response shape', () => {
    let client: Hookbase;

    beforeEach(() => {
      client = new Hookbase({
        apiKey: 'test_api_key',
        fetch: mockFetch,
        retries: 0,
      });
    });

    it('surfaces the API\'s own message on 401, not the generic default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Map(),
        json: () => Promise.resolve({ error: 'API key has been revoked', code: 'key_revoked' }),
      });

      const error = await client.applications.get('app_123').catch((e) => e);

      // HookbaseAuthenticationError fixes its own `code` to 'authentication_error' regardless
      // of what the API sent — only the message extraction is under test here.
      expect(error).toBeInstanceOf(HookbaseAuthenticationError);
      expect(error.message).toBe('API key has been revoked');
    });

    it('surfaces the API\'s own message on 429, not the generic default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Map([['retry-after', '120']]),
        json: () =>
          Promise.resolve({
            error: "You've used today's RCA budget (100/day on pro). Resets at UTC midnight.",
            code: 'rca_budget_exceeded',
          }),
      });

      const error = await client.applications.get('app_123').catch((e) => e);

      expect(error).toBeInstanceOf(HookbaseRateLimitError);
      expect(error.message).toBe(
        "You've used today's RCA budget (100/day on pro). Resets at UTC midnight."
      );
      expect(error.retryAfter).toBe(120);
    });

    it('reads field errors from details.fieldErrors (zod .flatten() shape) on 400', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Map(),
        json: () =>
          Promise.resolve({
            error: 'Invalid input',
            details: { formErrors: [], fieldErrors: { name: ['Required'] } },
          }),
      });

      const error = await client.applications.create({ name: '' }).catch((e) => e);

      expect(error).toBeInstanceOf(HookbaseValidationError);
      expect(error.message).toBe('Invalid input');
      expect(error.validationErrors).toEqual({ name: ['Required'] });
    });

    it('surfaces the API\'s own message on an unmapped status code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: new Map(),
        json: () => Promise.resolve({ error: 'Delivery worker unavailable', code: 'worker_down' }),
      });

      const error = await client.applications.get('app_123').catch((e) => e);

      expect(error).toBeInstanceOf(HookbaseApiError);
      expect(error.message).toBe('Delivery worker unavailable');
      expect(error.code).toBe('worker_down');
    });
  });

  describe('retries', () => {
    it('should retry on network errors', async () => {
      const client = new Hookbase({
        apiKey: 'test_api_key',
        fetch: mockFetch,
        retries: 2,
      });

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          json: () => Promise.resolve({ data: { id: 'app_123' } }),
        });

      const result = await client.applications.get('app_123');

      expect(result.id).toBe('app_123');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on authentication errors', async () => {
      const client = new Hookbase({
        apiKey: 'test_api_key',
        fetch: mockFetch,
        retries: 2,
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Map(),
        json: () => Promise.resolve({ error: { message: 'Unauthorized' } }),
      });

      await expect(client.applications.get('app_123')).rejects.toThrow(
        HookbaseAuthenticationError
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('idempotency', () => {
    it('should include idempotency key header', async () => {
      const client = new Hookbase({
        apiKey: 'test_api_key',
        fetch: mockFetch,
        retries: 0,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ data: { eventId: 'msg_123', messagesQueued: 0, endpoints: [] } }),
      });

      await client.messages.send(
        'app_123',
        { eventType: 'test', payload: {} },
        { idempotencyKey: 'unique_key_123' }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Idempotency-Key': 'unique_key_123',
          }),
        })
      );
    });
  });
});
