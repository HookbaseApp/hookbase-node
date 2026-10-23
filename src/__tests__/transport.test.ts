import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hookbase, parseRetryAfter } from '../client';
import {
  HookbaseApiError,
  HookbaseForbiddenError,
  HookbaseNetworkError,
  HookbaseRateLimitError,
  HookbaseTimeoutError,
  HookbaseValidationError,
} from '../errors';

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  const h = new Headers({ 'content-type': 'application/json', ...headers });
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: h,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function connectionRefused(): Error {
  const err = new TypeError('fetch failed');
  (err as { cause?: unknown }).cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
    code: 'ECONNREFUSED',
  });
  return err;
}

/** A fetch that never resolves until its signal aborts, like a hung server. */
function hangingFetch() {
  return vi.fn((_url: string, init: { signal: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    })
  );
}

describe('transport', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('request shape', () => {
    it('sends auth, user agent and accept headers, and no content-type without a body', async () => {
      const client = new Hookbase({ apiKey: 'whr_abc', fetch: mockFetch, retries: 0 });
      mockFetch.mockResolvedValueOnce(response(200, { data: [] }));
      await client.request('GET', '/api/sources');
      const init = mockFetch.mock.calls[0][1];
      expect(init.headers.Authorization).toBe('Bearer whr_abc');
      expect(init.headers['User-Agent']).toMatch(/^hookbase-sdk-node\/\d+\.\d+\.\d+$/);
      expect(init.headers.Accept).toBe('application/json');
      expect(init.headers['Content-Type']).toBeUndefined();
      expect(init.headers['Idempotency-Key']).toBeUndefined();
      expect(init.body).toBeUndefined();
    });

    it('strips a trailing slash from baseUrl and drops undefined query values', async () => {
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0, baseUrl: 'http://localhost:8787/' });
      mockFetch.mockResolvedValueOnce(response(200, {}));
      await client.request('GET', '/api/x', { query: { a: 1, b: undefined, c: false } });
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:8787/api/x?a=1&c=false');
    });

    it('returns text for a non-JSON success response (CSV export)', async () => {
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
      mockFetch.mockResolvedValueOnce(response(200, 'id,name\n1,a\n', { 'content-type': 'text/csv' }));
      await expect(client.request('GET', '/api/events/export')).resolves.toBe('id,name\n1,a\n');
    });

    it('rejects a missing API key', () => {
      expect(() => new Hookbase({ apiKey: '' })).toThrow('API key is required');
    });
  });

  describe('error mapping', () => {
    const cases: Array<[number, new (...args: never[]) => Error]> = [
      [403, HookbaseForbiddenError],
      [422, HookbaseValidationError],
      [409, HookbaseApiError],
      [413, HookbaseApiError],
      [500, HookbaseApiError],
    ];
    for (const [status, cls] of cases) {
      it(`maps ${status} to ${cls.name} with the API message, code and request id`, async () => {
        const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
        mockFetch.mockResolvedValueOnce(
          response(status, { error: `msg ${status}`, code: 'some_code' }, { 'x-request-id': 'req_9' })
        );
        const err: any = await client.request('GET', '/api/x').catch((e: any) => e);
        expect(err).toBeInstanceOf(cls);
        expect(err).toBeInstanceOf(HookbaseApiError);
        expect(err.status).toBe(status);
        expect(err.message).toBe(`msg ${status}`);
        expect(err.requestId).toBe('req_9');
        if (cls === HookbaseApiError) expect(err.code).toBe('some_code');
      });
    }

    it('falls back to a generic message when the error body is not JSON', async () => {
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: new Headers(),
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      });
      await expect(client.request('GET', '/api/x')).rejects.toMatchObject({
        status: 502,
        message: 'API error: 502',
        code: 'unknown_error',
      });
    });
  });

  describe('Retry-After', () => {
    it('parses delta-seconds, HTTP-dates and garbage', () => {
      const now = Date.parse('2026-10-23T00:00:00Z');
      expect(parseRetryAfter('5', now)).toBe(5);
      expect(parseRetryAfter('0', now)).toBe(0);
      expect(parseRetryAfter('Fri, 23 Oct 2026 00:00:10 GMT', now)).toBe(10);
      expect(parseRetryAfter('Thu, 22 Oct 2026 00:00:00 GMT', now)).toBe(0);
      expect(parseRetryAfter(null, now)).toBe(60);
      expect(parseRetryAfter('soon', now)).toBe(60);
    });

    it('retries a 429 for a POST without an idempotency key, waiting Retry-After', async () => {
      vi.useFakeTimers();
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 2 });
      mockFetch
        .mockResolvedValueOnce(response(429, { error: 'slow down' }, { 'retry-after': '2' }))
        .mockResolvedValueOnce(response(201, { ok: true }));
      const pending = client.request('POST', '/api/x', { body: {} });
      await vi.advanceTimersByTimeAsync(1999);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('honours an HTTP-date Retry-After instead of retrying immediately', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(Date.parse('2026-10-23T00:00:00Z'));
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 1 });
      mockFetch
        .mockResolvedValueOnce(response(429, {}, { 'retry-after': 'Fri, 23 Oct 2026 00:00:03 GMT' }))
        .mockResolvedValueOnce(response(200, { ok: true }));
      const pending = client.request('GET', '/api/x');
      await vi.advanceTimersByTimeAsync(2500);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(600);
      await expect(pending).resolves.toEqual({ ok: true });
    });

    it('throws HookbaseRateLimitError with retryAfter once retries run out', async () => {
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
      mockFetch.mockResolvedValueOnce(response(429, { error: 'Too many requests' }, { 'retry-after': '7' }));
      const err: any = await client.request('GET', '/api/x').catch((e: any) => e);
      expect(err).toBeInstanceOf(HookbaseRateLimitError);
      expect(err.retryAfter).toBe(7);
      expect(err.message).toBe('Too many requests');
    });

    it('throws at once instead of waiting out a Retry-After over 60s', async () => {
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 3 });
      mockFetch.mockResolvedValueOnce(response(429, { error: 'Monthly limit' }, { 'retry-after': '3600' }));
      const err: any = await client.request('GET', '/api/x').catch((e: any) => e);
      expect(err).toBeInstanceOf(HookbaseRateLimitError);
      expect(err.retryAfter).toBe(3600);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('still waits out a Retry-After of exactly 60s', async () => {
      vi.useFakeTimers();
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 1 });
      mockFetch
        .mockResolvedValueOnce(response(429, {}, { 'retry-after': '60' }))
        .mockResolvedValueOnce(response(200, { ok: true }));
      const pending = client.request('GET', '/api/x');
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(pending).resolves.toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('retry policy', () => {
    it('retries a POST on a 5xx when it carries an idempotency key, resending the same key', async () => {
      vi.useFakeTimers();
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 2 });
      mockFetch
        .mockResolvedValueOnce(response(503, { error: 'unavailable' }))
        .mockResolvedValueOnce(response(200, { ok: true }));
      const pending = client.request('POST', '/api/x', { body: {}, requestOptions: { idempotencyKey: 'idem_1' } });
      await vi.runAllTimersAsync();
      await expect(pending).resolves.toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls.map((c) => c[1].headers['Idempotency-Key'])).toEqual(['idem_1', 'idem_1']);
    });

    it('retries PATCH, PUT and DELETE on a 5xx', async () => {
      vi.useFakeTimers();
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 1 });
      for (const method of ['PATCH', 'PUT', 'DELETE']) {
        mockFetch.mockReset();
        mockFetch
          .mockResolvedValueOnce(response(500, {}))
          .mockResolvedValueOnce(response(200, { ok: method }));
        const pending = client.request(method, '/api/x', { body: {} });
        await vi.runAllTimersAsync();
        await expect(pending).resolves.toEqual({ ok: method });
        expect(mockFetch).toHaveBeenCalledTimes(2);
      }
    });

    it('retries a POST whose connection was refused (it never reached the server)', async () => {
      vi.useFakeTimers();
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 1 });
      mockFetch.mockRejectedValueOnce(connectionRefused()).mockResolvedValueOnce(response(201, { ok: true }));
      const pending = client.request('POST', '/api/x', { body: {} });
      await vi.runAllTimersAsync();
      await expect(pending).resolves.toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('gives up after the configured number of retries with the last error', async () => {
      vi.useFakeTimers();
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 2 });
      mockFetch.mockResolvedValue(response(500, { error: 'still down' }));
      const pending = client.request('GET', '/api/x').catch((e: any) => e);
      await vi.runAllTimersAsync();
      const err: any = await pending;
      expect(err).toBeInstanceOf(HookbaseApiError);
      expect(err.message).toBe('still down');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('treats a negative retry count as zero instead of sending nothing', async () => {
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: -1 });
      mockFetch.mockResolvedValueOnce(response(200, { ok: true }));
      await expect(client.request('GET', '/api/x')).resolves.toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('per-request retries override the client default', async () => {
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 3 });
      mockFetch.mockResolvedValueOnce(response(500, {}));
      await expect(client.request('GET', '/api/x', { requestOptions: { retries: 0 } })).rejects.toBeInstanceOf(
        HookbaseApiError
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('timeouts and cancellation', () => {
    it('throws HookbaseTimeoutError when the server does not answer in time', async () => {
      const fetchFn = hangingFetch();
      const client = new Hookbase({ apiKey: 'k', fetch: fetchFn as unknown as typeof fetch, retries: 0, timeout: 20 });
      await expect(client.request('GET', '/api/x')).rejects.toBeInstanceOf(HookbaseTimeoutError);
    });

    it('per-request timeout overrides the client default', async () => {
      const fetchFn = hangingFetch();
      const client = new Hookbase({ apiKey: 'k', fetch: fetchFn as unknown as typeof fetch, retries: 0, timeout: 60_000 });
      await expect(client.request('GET', '/api/x', { requestOptions: { timeout: 20 } })).rejects.toThrow(
        'Request timed out after 20ms'
      );
    });

    it('times out a body that stalls after the headers arrived', async () => {
      const fetchFn = vi.fn((_url: string, init: { signal: AbortSignal }) =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            new Promise((_resolve, reject) => {
              init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
            }),
        })
      );
      const client = new Hookbase({ apiKey: 'k', fetch: fetchFn as unknown as typeof fetch, retries: 0, timeout: 20 });
      await expect(client.request('GET', '/api/x')).rejects.toBeInstanceOf(HookbaseTimeoutError);
    });

    it('retries a GET after a timeout', async () => {
      let calls = 0;
      const fetchFn = vi.fn((_url: string, init: { signal: AbortSignal }) => {
        calls++;
        if (calls === 1) {
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
          });
        }
        return Promise.resolve(response(200, { ok: true }));
      });
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const client = new Hookbase({ apiKey: 'k', fetch: fetchFn as unknown as typeof fetch, retries: 1, timeout: 20 });
      vi.useFakeTimers();
      const pending = client.request('GET', '/api/x');
      await vi.advanceTimersByTimeAsync(20);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toEqual({ ok: true });
      expect(calls).toBe(2);
      vi.restoreAllMocks();
    });

    it('does not retry a request the caller cancelled', async () => {
      const controller = new AbortController();
      const fetchFn = hangingFetch();
      const client = new Hookbase({ apiKey: 'k', fetch: fetchFn as unknown as typeof fetch, retries: 3 });
      const pending = client.request('GET', '/api/x', { requestOptions: { signal: controller.signal } });
      controller.abort(new Error('user cancelled'));
      await expect(pending).rejects.toThrow('user cancelled');
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('stops waiting between retries when the caller cancels', async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValue(response(503, {}));
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 3 });
      const pending = client.request('GET', '/api/x', { requestOptions: { signal: controller.signal } });
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();
      const err: any = await pending.catch((e: any) => e);
      expect(err.name).toBe('AbortError');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('wraps other transport failures in HookbaseNetworkError with the cause', async () => {
      const client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
      const cause = connectionRefused();
      mockFetch.mockRejectedValueOnce(cause);
      const err: any = await client.request('GET', '/api/x').catch((e: any) => e);
      expect(err).toBeInstanceOf(HookbaseNetworkError);
      expect(err.cause).toBe(cause);
    });
  });
});
