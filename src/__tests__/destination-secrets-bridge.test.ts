import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';
import type { DestinationTestResult } from '../types';

/**
 * Destination signing secrets and bridge destinations, checked against api/src/routes/destinations.ts
 * and outbound-messages.ts. Each mocked response is the shape the route builds.
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

/** A 429 the client may retry at once. */
function rateLimited() {
  return {
    ...jsonResponse({ error: 'slow down' }, 429),
    headers: new Headers({ 'content-type': 'application/json', 'retry-after': '0' }),
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

const httpDestination = {
  id: 'dst_1',
  name: 'Orders',
  slug: 'orders',
  type: 'http',
  url: 'https://receiver.example/hook',
  hasSigningSecret: true,
  config: null,
};

const bridgeConfig = {
  eventTypeSource: 'field',
  eventTypeField: 'type',
  eventTypePrefix: 'stripe.',
  applicationId: null,
};

describe('destinations: signing secrets', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
  });

  it('create returns the signing secret shown once, with hasSigningSecret', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ destination: { ...httpDestination, signingSecret: 'whsec_abc' } }, 201)
    );

    const destination = await client.destinations.create({
      name: 'Orders',
      url: 'https://receiver.example/hook',
    });

    expect(destination.signingSecret).toBe('whsec_abc');
    expect(destination.hasSigningSecret).toBe(true);
  });

  it('create gives a null signingSecret when the API sends none', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ destination: { ...httpDestination, type: 'r2', hasSigningSecret: false } }, 201)
    );

    const destination = await client.destinations.create({ name: 'Archive', type: 'r2', config: { bucket: 'b' } });

    expect(destination.signingSecret).toBeNull();
  });

  it('revealSecret GETs /reveal-secret with no body', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ signingSecret: 'whsec_abc', previousSecretExpiresAt: '2026-11-12T10:00:00.000Z' })
    );

    const secret = await client.destinations.revealSecret('dst_1');

    const c = call(mockFetch);
    expect(c.method).toBe('GET');
    expect(c.url.pathname).toBe('/api/destinations/dst_1/reveal-secret');
    expect(c.body).toBeUndefined();
    expect(secret).toEqual({
      signingSecret: 'whsec_abc',
      previousSecretExpiresAt: '2026-11-12T10:00:00.000Z',
    });
  });

  it('rotateSecret POSTs /rotate-secret with no body by default', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ signingSecret: 'whsec_new', previousSecretExpiresAt: '2026-11-12T11:00:00.000Z' }));

    const rotated = await client.destinations.rotateSecret('dst_1');

    const c = call(mockFetch);
    expect(c.method).toBe('POST');
    expect(c.url.pathname).toBe('/api/destinations/dst_1/rotate-secret');
    expect(c.body).toBeUndefined();
    expect(rotated.signingSecret).toBe('whsec_new');
    expect(rotated.previousSecretExpiresAt).toBe('2026-11-12T11:00:00.000Z');
  });

  it('rotateSecret sends gracePeriodSeconds, alone or with options', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ signingSecret: 'whsec_1', previousSecretExpiresAt: null }))
      .mockResolvedValueOnce(jsonResponse({ signingSecret: 'whsec_2', previousSecretExpiresAt: null }));

    const rotated = await client.destinations.rotateSecret('dst_1', { gracePeriodSeconds: 0 });
    await client.destinations.rotateSecret('dst_1', { gracePeriodSeconds: 60 }, { timeout: 5000 });

    expect(call(mockFetch, 0).body).toEqual({ gracePeriodSeconds: 0 });
    expect(call(mockFetch, 1).body).toEqual({ gracePeriodSeconds: 60 });
    expect(rotated.previousSecretExpiresAt).toBeNull();
  });

  it('rotateSecret still takes RequestOptions as the second argument, and drops idempotencyKey', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ signingSecret: 'whsec_new', previousSecretExpiresAt: null }));

    await client.destinations.rotateSecret('dst_1', { idempotencyKey: 'rot_1' });

    const c = call(mockFetch);
    expect(c.body).toBeUndefined();
    // The API doesn't deduplicate rotations, so the key isn't sent (and can't make it retryable).
    expect(c.headers['Idempotency-Key']).toBeUndefined();
  });

  it('rotateSecret is not retried after a 5xx', async () => {
    const retrying = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 3 });
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 502));

    await expect(retrying.destinations.rotateSecret('dst_1')).rejects.toMatchObject({ status: 502 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // A retried rotation that had gone through would replace the secret just handed out, and push the
  // one receivers hold out of its grace period.
  it('rotateSecret is not retried after a 502 even with an idempotencyKey', async () => {
    const retrying = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 3 });
    mockFetch.mockResolvedValue(jsonResponse({ error: 'boom' }, 502));

    await expect(
      retrying.destinations.rotateSecret('dst_1', { gracePeriodSeconds: 600 }, { idempotencyKey: 'rot_1' })
    ).rejects.toMatchObject({ status: 502 });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await expect(
      retrying.destinations.rotateSecret('dst_1', { idempotencyKey: 'rot_2', retries: 3 })
    ).rejects.toMatchObject({ status: 502 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('rotateSecret still retries a 429, which ran nothing', async () => {
    const retrying = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 2 });
    mockFetch
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(jsonResponse({ signingSecret: 'whsec_new', previousSecretExpiresAt: null }));

    const rotated = await retrying.destinations.rotateSecret('dst_1', { idempotencyKey: 'rot_1' });

    expect(rotated.signingSecret).toBe('whsec_new');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('get and list pass hasSigningSecret through', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ destination: httpDestination }))
      .mockResolvedValueOnce(
        jsonResponse({ destinations: [httpDestination], pagination: { total: 1, page: 1, pageSize: 20 } })
      );

    expect((await client.destinations.get('dst_1')).hasSigningSecret).toBe(true);
    expect((await client.destinations.list()).data[0].hasSigningSecret).toBe(true);
  });
});

describe('destinations: bridge', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
  });

  it('create sends type bridge and the config as given', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          destination: {
            id: 'dst_b',
            name: 'Stripe to customers',
            slug: 'stripe-to-customers',
            type: 'bridge',
            config: bridgeConfig,
            hasSigningSecret: false,
            signingSecret: null,
          },
        },
        201
      )
    );

    const destination = await client.destinations.create({
      name: 'Stripe to customers',
      type: 'bridge',
      config: {
        eventTypeSource: 'field',
        eventTypeField: 'type',
        eventTypePrefix: 'stripe.',
        applicationId: null,
      },
    });

    const c = call(mockFetch);
    expect(c.body).toEqual({
      name: 'Stripe to customers',
      slug: 'stripe-to-customers',
      type: 'bridge',
      config: bridgeConfig,
    });
    expect(destination.type).toBe('bridge');
    expect(destination.config).toEqual(bridgeConfig);
    expect(destination.signingSecret).toBeNull();
  });

  it('get returns a bridge config that narrows on eventTypeSource', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ destination: { id: 'dst_b', type: 'bridge', config: bridgeConfig, hasSigningSecret: false } })
    );

    const destination = await client.destinations.get('dst_b');

    const config = destination.config;
    expect(config && 'eventTypeSource' in config ? config.eventTypeField : undefined).toBe('type');
  });

  it('test(id) still sends no body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, status: 200, latencyMs: 12 }));

    await client.destinations.test('dst_1');

    const c = call(mockFetch);
    expect(c.method).toBe('POST');
    expect(c.url.pathname).toBe('/api/destinations/dst_1/test');
    expect(c.body).toBeUndefined();
  });

  it('test(id, undefined, options) sends no body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, status: 200, latencyMs: 12 }));

    await client.destinations.test('dst_1', undefined, { idempotencyKey: 'test_1' });

    const c = call(mockFetch);
    expect(c.body).toBeUndefined();
    expect(c.headers['Idempotency-Key']).toBe('test_1');
  });

  it('test(id, options) still treats the second argument as RequestOptions', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, status: 200, latencyMs: 12 }));

    await client.destinations.test('dst_1', { idempotencyKey: 'test_1' });

    const c = call(mockFetch);
    expect(c.body).toBeUndefined();
    expect(c.headers['Idempotency-Key']).toBe('test_1');
  });

  it('test(id, { payload }) sends the sample payload and returns the dry run', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        dryRun: true,
        eventType: 'stripe.invoice.paid',
        eventTypeExists: true,
        matchingEndpoints: 3,
      })
    );

    const result: DestinationTestResult = await client.destinations.test(
      'dst_b',
      { payload: { type: 'invoice.paid' } },
      { timeout: 5000 }
    );

    expect(call(mockFetch).body).toEqual({ payload: { type: 'invoice.paid' } });
    expect(result.success).toBe(true);
    if (!result.dryRun) throw new Error('expected a dry run');
    expect(result.eventType).toBe('stripe.invoice.paid');
    expect(result.eventTypeExists).toBe(true);
    expect(result.matchingEndpoints).toBe(3);
    // A dry run has no response to mirror onto the deprecated names.
    expect('statusCode' in result).toBe(false);
    expect('duration' in result).toBe(false);
  });

  it('a dry run whose event type could not be resolved carries the reason', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: false,
        dryRun: true,
        eventType: null,
        eventTypeExists: false,
        matchingEndpoints: 0,
        error: "Payload field 'type' is missing",
      })
    );

    const result = await client.destinations.test('dst_b', { payload: {} });

    expect(result).toMatchObject({ success: false, dryRun: true, eventType: null, error: "Payload field 'type' is missing" });
  });

  it("fills in the dry-run fields the API leaves out when the bridge's config is invalid", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: false, dryRun: true, error: 'Bridge destination config is invalid' })
    );

    const result = await client.destinations.test('dst_b');

    expect(result).toEqual({
      success: false,
      dryRun: true,
      error: 'Bridge destination config is invalid',
      eventType: null,
      eventTypeExists: false,
      matchingEndpoints: 0,
    });
  });
});

describe('outbound messages: bridge origin', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new Hookbase({ apiKey: 'k', fetch: mockFetch, retries: 0 });
  });

  it('get carries the inbound event and delivery a bridge published the event from', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: 'msg_2',
          eventId: 'e2',
          status: 'success',
          holdExpiresAt: null,
          traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
          eventVersion: 'v2',
          deliveredEventVersion: 'v1',
          bridge: { inboundEventId: 'evt_in', deliveryId: 'del_in', hop: 1 },
        },
      })
    );

    const message = await client.messages.get('app_1', 'msg_2');

    expect(message.bridge).toEqual({ inboundEventId: 'evt_in', deliveryId: 'del_in', hop: 1 });
    expect(message.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(message.eventVersion).toBe('v2');
    expect(message.deliveredEventVersion).toBe('v1');
  });
});
