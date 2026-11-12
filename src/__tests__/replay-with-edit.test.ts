import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';
import { HookbaseError } from '../errors';

/**
 * Replay with edits (api/src/routes/deliveries.ts POST /:deliveryId/replay) and the typed
 * deliveries of the event debugger (api/src/routes/events.ts GET /:eventId/debug). Each mocked
 * response is the shape the route builds.
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

describe('deliveries.replayWithEdit', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  const replayed = {
    deliveryId: 'del_new',
    message: 'Replay queued with modified payload, header overrides',
    modified: true,
    destinationOverridden: false,
    transformOverridden: false,
    transformPersisted: false,
    headersOverridden: true,
    targetDestinationId: 'dst_1',
  };

  beforeEach(() => {
    mockFetch.mockReset();
    client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
  });

  it('POSTs the edits to /replay and returns what the API reports', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(replayed));

    const result = await client.deliveries.replayWithEdit('del_1', {
      payloadPatch: { amount: 100, obsolete: null },
      headersOverride: { 'X-Replay': '1' },
    });

    const c = call(mockFetch);
    expect(c.method).toBe('POST');
    expect(c.url.pathname).toBe('/api/deliveries/del_1/replay');
    expect(c.body).toEqual({ payloadPatch: { amount: 100, obsolete: null }, headersOverride: { 'X-Replay': '1' } });
    expect(result).toEqual(replayed);
  });

  it('sends every edit field under the name the API reads', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(replayed));

    await client.deliveries.replayWithEdit('del_1', {
      modifiedPayload: { id: 1 },
      destinationOverride: 'staging-receiver',
      transformOverride: { code: '$', type: 'jsonata', inputFormat: 'json', outputFormat: 'json' },
      headersOverride: { 'X-A': 'b' },
      persistTransform: true,
    });

    expect(call(mockFetch).body).toEqual({
      modifiedPayload: { id: 1 },
      destinationOverride: 'staging-receiver',
      transformOverride: { code: '$', type: 'jsonata', inputFormat: 'json', outputFormat: 'json' },
      headersOverride: { 'X-A': 'b' },
      persistTransform: true,
    });
  });

  it('refuses modifiedPayload and payloadPatch together without sending anything', async () => {
    await expect(
      client.deliveries.replayWithEdit('del_1', { modifiedPayload: { a: 1 }, payloadPatch: { a: 2 } })
    ).rejects.toBeInstanceOf(HookbaseError);
    await expect(
      client.deliveries.replayWithEdit('del_1', { modifiedPayload: { a: 1 }, payloadPatch: { a: 2 } })
    ).rejects.toThrow(/either modifiedPayload or payloadPatch/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('is not retried after a 5xx', async () => {
    const retrying = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 3 });
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 503));

    await expect(retrying.deliveries.replayWithEdit('del_1', { payloadPatch: { a: 1 } })).rejects.toMatchObject({ status: 503 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('leaves replay() as it was: no body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ...replayed, modified: false, headersOverridden: false, message: 'Replay queued' }));

    const result = await client.deliveries.replay('del_1');

    expect(call(mockFetch).body).toBeUndefined();
    expect(result.deliveryId).toBe('del_new');
    expect(result.modified).toBe(false);
  });
});

describe('events.debug deliveries', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
  });

  it('types each delivery as events.ts formatDelivery builds it', async () => {
    const delivery = {
      id: 'del_1',
      status: 'held',
      statusCode: 503,
      durationMs: 120,
      attempt: 2,
      maxAttempts: 5,
      nextRetryAt: null,
      holdExpiresAt: '2026-11-12T00:00:00.000Z',
      error: 'Service Unavailable',
      responseBody: 'down',
      responseHeaders: { 'retry-after': '30' },
      transformedPayload: null,
      routeId: 'r1',
      destinationId: 'd1',
      destination: { name: 'Orders', url: 'https://receiver.example/hook', method: 'POST' },
      startedAt: '2026-11-11T20:00:00.000Z',
      completedAt: '2026-11-11T20:00:01.000Z',
      failoverIndex: 0,
      parentDeliveryId: null,
      fingerprint: 'fp_1',
      retryAfter: '30',
      clusterCount: 7,
      patternHints: [
        { id: 'upstream-503', category: 'availability', title: 'Destination unavailable', hypothesis: 'h', suggestedFix: 'f' },
      ],
      routeCircuit: { state: 'open', openedAt: '2026-11-11T19:59:00.000Z', cooldownSeconds: 300, failureThreshold: 5, consecutiveFailures: 5 },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ event: { id: 'evt_1' }, deliveries: [delivery], debug: { curlCommand: null } }));

    const info = await client.events.debug('evt_1');

    const d = info.deliveries[0];
    expect(d).toEqual(delivery);
    expect(d.holdExpiresAt).toBe('2026-11-12T00:00:00.000Z');
    expect(d.routeCircuit?.state).toBe('open');
    expect(d.patternHints[0].suggestedFix).toBe('f');
    // Still readable as a record, as when deliveries were typed Array<Record<string, unknown>>.
    const asRecord: Record<string, unknown> = d;
    expect(asRecord.clusterCount).toBe(7);
  });
});
