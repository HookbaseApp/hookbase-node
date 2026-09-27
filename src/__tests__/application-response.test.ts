import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';
import type { Application } from '../types';

/**
 * What an `Application` actually contains after a call returns.
 *
 * The drift here ran the opposite way to the request-side drift in wire-format.test.ts. The
 * `Application` interface declared `uid: string`; the API has never sent a key by that name — it
 * sends `externalId` (api/src/routes/webhook-applications.ts, formatApplicationRow) — and nothing
 * mapped between them. So the property was typed as a present string while being `undefined` at
 * runtime, and tsc had nothing to say about code that read it. The same interface omitted thirteen
 * fields the API does send, which made the rate limits, the disabled state and the message counters
 * unreadable through the SDK.
 *
 * A test over types alone would have passed throughout, exactly as on the request side. These check
 * the object the caller is handed.
 */

const mockResponse = (body: unknown, status = 200) => ({
  ok: true,
  status,
  headers: new Map(),
  json: () => Promise.resolve(body),
});

/** Every key formatApplicationRow puts on an application, populated with non-default values. */
const APPLICATION_ROW = {
  id: 'app_1',
  organizationId: 'org_1',
  externalId: 'customer-42',
  name: 'Acme',
  metadata: { tier: 'gold' },
  rateLimitPerSecond: 10,
  rateLimitPerMinute: 100,
  rateLimitPerHour: 1000,
  isDisabled: true,
  disabledAt: '2026-01-02T03:04:05Z',
  disabledReason: 'abuse',
  totalEndpoints: 3,
  totalMessagesSent: 400,
  totalMessagesFailed: 5,
  lastEventAt: '2026-01-03T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-04T00:00:00Z',
  createdBy: 'user_1',
  apiKeyId: 'key_1',
} as const;

describe('application responses', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new Hookbase({ apiKey: 'test_api_key', fetch: mockFetch, retries: 0 });
  });

  it('passes through every field the API returns', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: APPLICATION_ROW }));

    const app = await client.applications.get('app_1');

    // Named individually rather than with toMatchObject so that a field the interface declares but
    // the response drops is a failure here, not a silently absent property.
    expect(app.externalId).toBe('customer-42');
    expect(app.metadata).toEqual({ tier: 'gold' });
    expect(app.rateLimitPerSecond).toBe(10);
    expect(app.rateLimitPerMinute).toBe(100);
    expect(app.rateLimitPerHour).toBe(1000);
    expect(app.isDisabled).toBe(true);
    expect(app.disabledAt).toBe('2026-01-02T03:04:05Z');
    expect(app.disabledReason).toBe('abuse');
    expect(app.totalEndpoints).toBe(3);
    expect(app.totalMessagesSent).toBe(400);
    expect(app.totalMessagesFailed).toBe(5);
    expect(app.lastEventAt).toBe('2026-01-03T00:00:00Z');
    expect(app.createdBy).toBe('user_1');
    expect(app.apiKeyId).toBe('key_1');
  });

  it('declares a property for every key the API sends', async () => {
    // The completeness guard, and the reason APPLICATION_ROW is `as const`: the conditional type
    // resolves to `never` the moment a key of the fixture is not a key of Application, and `true`
    // is not assignable to `never`, so tsc fails before vitest runs. Add a field to
    // formatApplicationRow, add it to APPLICATION_ROW, and the build stays red until the interface
    // can hold it. An excess-property check would not do this job — TypeScript does not apply one
    // to a spread.
    const covered: keyof typeof APPLICATION_ROW extends keyof Application ? true : never = true;
    expect(covered).toBe(true);

    // The other half: the SDK hands back the response object, so every key it carried must still be
    // there. A resource method that picked fields by hand would fail here.
    mockFetch.mockResolvedValueOnce(mockResponse({ data: APPLICATION_ROW }));
    const app = await client.applications.get('app_1');

    for (const key of Object.keys(APPLICATION_ROW)) {
      expect(app, key).toHaveProperty(key);
    }
  });

  it('fills in the deprecated uid from externalId', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: APPLICATION_ROW }));

    const app = await client.applications.get('app_1');

    expect(app.uid).toBe('customer-42');
    expect(app.uid).toBe(app.externalId);
  });

  it('fills in uid on every call that returns an application', async () => {
    // get is covered above; these are the other four single-object paths, and the mirror has to be
    // on all of them — a caller who reads `uid` off a create result and not off a get would find it
    // works in one place and not the other, which is worse than it never working.
    //
    // Exactly one queued response per call: a surplus `mockResolvedValueOnce` survives
    // clearAllMocks in vitest 3 and is handed to the first call of the *next* test.
    mockFetch
      .mockResolvedValueOnce(mockResponse({ data: APPLICATION_ROW }))
      .mockResolvedValueOnce(mockResponse({ data: APPLICATION_ROW }, 201))
      .mockResolvedValueOnce(mockResponse({ data: APPLICATION_ROW }))
      .mockResolvedValueOnce(mockResponse({ data: APPLICATION_ROW }));

    const results: Application[] = [
      await client.applications.getByUid('customer-42'),
      await client.applications.create({ name: 'Acme', uid: 'customer-42' }),
      await client.applications.update('app_1', { name: 'Acme 2' }),
      await client.applications.getOrCreate('customer-42', { name: 'Acme' }),
    ];

    for (const app of results) {
      expect(app.uid).toBe('customer-42');
    }
  });

  it('fills in uid on list and listAll', async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockResponse({ data: [APPLICATION_ROW], pagination: { hasMore: false, nextCursor: null } })
      )
      .mockResolvedValueOnce(
        mockResponse({ data: [APPLICATION_ROW], pagination: { hasMore: false, nextCursor: null } })
      );

    const page = await client.applications.list();
    expect(page.data[0].uid).toBe('customer-42');

    for await (const app of client.applications.listAll()) {
      expect(app.uid).toBe('customer-42');
    }
  });

  it('leaves uid undefined when the API sends no externalId', async () => {
    // Mirroring is one-directional. A response with no external id must not invent one, and a
    // stray `uid` key on the wire must not be read as one — the API does not send that key, so a
    // response carrying it is not something to trust.
    const { externalId, ...withoutExternalId } = APPLICATION_ROW;
    mockFetch.mockResolvedValueOnce(
      mockResponse({ data: { ...withoutExternalId, uid: 'should-be-ignored' } })
    );

    const app = await client.applications.get('app_1');

    expect(app.externalId).toBeUndefined();
    expect(app.uid).toBeUndefined();
  });
});
