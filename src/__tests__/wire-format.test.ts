import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';
import { HookbaseError } from '../errors';
import { deriveDestinationSlug } from '../resources/wire';
import type {
  CreateDestinationInput,
  CreateEndpointInput,
  UpdateDestinationInput,
  UpdateEndpointInput,
} from '../types';

/**
 * What these assert is the JSON that leaves the process, key by key.
 *
 * The endpoint and destination inputs carried names the API has never had: `filterTypes`,
 * `rateLimit`, `rateLimitPeriod` and `metadata` on endpoints, `description`, `retryCount`,
 * `retryInterval` and `timeout` on destinations. `z.object()` strips unknown keys rather than
 * refusing them, so every one of those calls came back 2xx with the setting dropped — a caller who
 * asked for a rate limit got an endpoint without one and nothing said so. Two of the drifts were
 * worse than silent: endpoint `headers` as a record failed `z.array()` outright, and a destination
 * created without a `slug` failed a required field, so both 400'd on every call that used them.
 *
 * The API schemas are becoming `.strict()`, which turns the silent drops into 400s as well. The
 * fields stay on the public types, deprecated, because deleting them breaks builds; what changed is
 * what reaches the wire. A test that only checked types would have passed throughout the whole
 * drift, so these check bodies.
 */

const mockResponse = (body: unknown, status = 200) => ({
  ok: true,
  status,
  headers: new Map(),
  json: () => Promise.resolve(body),
});

/** The exact keys POST /api/webhook-endpoints accepts (`createEndpointSchema`). */
const ENDPOINT_CREATE_WIRE_FIELDS = [
  'applicationId', 'url', 'description', 'headers', 'timeoutSeconds', 'rateLimitPerSecond',
  'successStatusCodes', 'backoffType', 'retryDelays', 'ipAllowlistNotes', 'useStaticIp',
  'circuitFailureThreshold', 'circuitSuccessThreshold', 'circuitCooldownSeconds',
] as const;

/** The exact keys PATCH /api/webhook-endpoints/:id accepts (`updateEndpointSchema`). */
const ENDPOINT_UPDATE_WIRE_FIELDS = [
  'url', 'description', 'headers', 'timeoutSeconds', 'isDisabled', 'disabledReason',
  'rateLimitPerSecond', 'successStatusCodes', 'backoffType', 'retryDelays', 'ipAllowlistNotes',
  'useStaticIp', 'circuitFailureThreshold', 'circuitSuccessThreshold', 'circuitCooldownSeconds',
] as const;

/** The exact keys POST /api/destinations accepts (`createDestinationSchema`). */
const DESTINATION_CREATE_WIRE_FIELDS = [
  'name', 'slug', 'url', 'method', 'headers', 'authType', 'authConfig', 'timeoutMs', 'throttle',
  'type', 'config', 'batchSize', 'batchWindowSeconds', 'fieldMapping', 'useStaticIp',
] as const;

/** Keys that stay on the inputs for compatibility and must never be sent. */
const ENDPOINT_DEPRECATED_KEYS = ['filterTypes', 'rateLimit', 'rateLimitPeriod', 'metadata'] as const;
const DESTINATION_DEPRECATED_KEYS = ['description', 'timeout', 'retryCount', 'retryInterval'] as const;

describe('wire format', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  /** The body of the request the client just made, as the API would parse it. */
  const sentBody = (call = 0): Record<string, unknown> =>
    JSON.parse(mockFetch.mock.calls[call][1].body);

  beforeEach(() => {
    vi.clearAllMocks();
    client = new Hookbase({ apiKey: 'test_api_key', fetch: mockFetch, retries: 0 });
  });

  describe('POST /api/webhook-endpoints', () => {
    /** Every field the API accepts, set to a value inside its documented range. */
    const fullInput: CreateEndpointInput = {
      url: 'https://example.com/hook',
      description: 'Order events',
      headers: [{ name: 'X-Tenant', value: 'acme' }],
      timeoutSeconds: 45,
      rateLimitPerSecond: 20,
      successStatusCodes: [200, 201, '2xx'],
      backoffType: 'exponential',
      retryDelays: [5, 30, 300],
      ipAllowlistNotes: 'egress from 203.0.113.0/24',
      useStaticIp: true,
      circuitFailureThreshold: 5,
      circuitSuccessThreshold: 2,
      circuitCooldownSeconds: 120,
    };

    it('sends every accepted field under its exact API name, and nothing else', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }, 201));

      await client.endpoints.create('app_1', fullInput);

      expect(sentBody()).toEqual({
        url: 'https://example.com/hook',
        description: 'Order events',
        headers: [{ name: 'X-Tenant', value: 'acme' }],
        timeoutSeconds: 45,
        rateLimitPerSecond: 20,
        successStatusCodes: [200, 201, '2xx'],
        backoffType: 'exponential',
        retryDelays: [5, 30, 300],
        ipAllowlistNotes: 'egress from 203.0.113.0/24',
        useStaticIp: true,
        circuitFailureThreshold: 5,
        circuitSuccessThreshold: 2,
        circuitCooldownSeconds: 120,
        applicationId: 'app_1',
      });
      expect(Object.keys(sentBody()).sort()).toEqual([...ENDPOINT_CREATE_WIRE_FIELDS].sort());
    });

    it.each(ENDPOINT_DEPRECATED_KEYS)('does not send %s', async (key) => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }, 201));

      const deprecatedValues: Record<string, unknown> = {
        filterTypes: ['order.created'],
        rateLimit: 10,
        rateLimitPeriod: 60,
        metadata: { team: 'billing' },
      };

      await client.endpoints.create('app_1', {
        url: 'https://example.com/hook',
        [key]: deprecatedValues[key],
      } as CreateEndpointInput);

      expect(sentBody()).not.toHaveProperty(key);
    });

    it('keeps the accepted fields when a deprecated one is set alongside them', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }, 201));

      await client.endpoints.create('app_1', {
        url: 'https://example.com/hook',
        timeoutSeconds: 10,
        filterTypes: ['order.created'],
        metadata: { team: 'billing' },
      });

      expect(sentBody()).toEqual({
        url: 'https://example.com/hook',
        timeoutSeconds: 10,
        applicationId: 'app_1',
      });
    });

    it('sends rateLimit as rateLimitPerSecond', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }, 201));

      await client.endpoints.create('app_1', { url: 'https://example.com/hook', rateLimit: 25 });

      const body = sentBody();
      expect(body.rateLimitPerSecond).toBe(25);
      expect(body).not.toHaveProperty('rateLimit');
    });

    it('lets rateLimitPerSecond win when both names are set', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }, 201));

      await client.endpoints.create('app_1', {
        url: 'https://example.com/hook',
        rateLimit: 25,
        rateLimitPerSecond: 100,
      });

      const body = sentBody();
      expect(body.rateLimitPerSecond).toBe(100);
      expect(body).not.toHaveProperty('rateLimit');
    });

    it('carries rateLimit: 0 across the rename, rather than reading it as unset', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }, 201));

      // 0 means unlimited to this API, so a falsy check here would drop a real setting.
      await client.endpoints.create('app_1', { url: 'https://example.com/hook', rateLimit: 0 });

      expect(sentBody()).toEqual({
        url: 'https://example.com/hook',
        rateLimitPerSecond: 0,
        applicationId: 'app_1',
      });
    });

    it('ignores a deprecated key explicitly set to undefined', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }, 201));

      await client.endpoints.create('app_1', {
        url: 'https://example.com/hook',
        rateLimit: undefined,
        rateLimitPerSecond: 7,
      });

      expect(sentBody()).toEqual({
        url: 'https://example.com/hook',
        rateLimitPerSecond: 7,
        applicationId: 'app_1',
      });
    });

    it('converts headers given as a record into name/value pairs, in insertion order', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }, 201));

      await client.endpoints.create('app_1', {
        url: 'https://example.com/hook',
        headers: { 'X-Tenant': 'acme', Authorization: 'Bearer t0ken' },
      });

      expect(sentBody().headers).toEqual([
        { name: 'X-Tenant', value: 'acme' },
        { name: 'Authorization', value: 'Bearer t0ken' },
      ]);
    });

    it('passes headers already in the wire shape through unchanged', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }, 201));

      const headers = [
        { name: 'X-Tenant', value: 'acme' },
        { name: 'X-Trace', value: 'on' },
      ];
      await client.endpoints.create('app_1', { url: 'https://example.com/hook', headers });

      expect(sentBody().headers).toEqual(headers);
    });

    it('sends an empty header array for an empty record rather than {}', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }, 201));

      await client.endpoints.create('app_1', { url: 'https://example.com/hook', headers: {} });

      expect(sentBody().headers).toEqual([]);
    });
  });

  describe('PATCH /api/webhook-endpoints/:id', () => {
    const fullInput: UpdateEndpointInput = {
      url: 'https://example.com/hook-v2',
      description: null,
      headers: { 'X-Tenant': 'acme' },
      timeoutSeconds: 60,
      isDisabled: true,
      disabledReason: 'customer paused delivery',
      rateLimitPerSecond: 0,
      successStatusCodes: null,
      backoffType: null,
      retryDelays: null,
      ipAllowlistNotes: null,
      useStaticIp: false,
      circuitFailureThreshold: 10,
      circuitSuccessThreshold: 3,
      circuitCooldownSeconds: 600,
    };

    it('sends every accepted field under its exact API name, nulls included', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }));

      await client.endpoints.update('app_1', 'ep_1', fullInput);

      expect(sentBody()).toEqual({
        url: 'https://example.com/hook-v2',
        description: null,
        headers: [{ name: 'X-Tenant', value: 'acme' }],
        timeoutSeconds: 60,
        isDisabled: true,
        disabledReason: 'customer paused delivery',
        rateLimitPerSecond: 0,
        successStatusCodes: null,
        backoffType: null,
        retryDelays: null,
        ipAllowlistNotes: null,
        useStaticIp: false,
        circuitFailureThreshold: 10,
        circuitSuccessThreshold: 3,
        circuitCooldownSeconds: 600,
      });
      expect(Object.keys(sentBody()).sort()).toEqual([...ENDPOINT_UPDATE_WIRE_FIELDS].sort());
    });

    it.each(ENDPOINT_DEPRECATED_KEYS)('does not send %s', async (key) => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }));

      const deprecatedValues: Record<string, unknown> = {
        filterTypes: ['order.created'],
        rateLimit: 10,
        rateLimitPeriod: 60,
        metadata: { team: 'billing' },
      };

      await client.endpoints.update('app_1', 'ep_1', {
        [key]: deprecatedValues[key],
      } as UpdateEndpointInput);

      expect(sentBody()).not.toHaveProperty(key);
    });

    it('sends rateLimit as rateLimitPerSecond, and prefers rateLimitPerSecond', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }));
      await client.endpoints.update('app_1', 'ep_1', { rateLimit: 5 });
      expect(sentBody()).toEqual({ rateLimitPerSecond: 5 });

      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }));
      await client.endpoints.update('app_1', 'ep_1', { rateLimit: 5, rateLimitPerSecond: 50 });
      expect(sentBody(1)).toEqual({ rateLimitPerSecond: 50 });
    });

    it('still sends only isDisabled for disable() and enable()', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }));
      await client.endpoints.disable('app_1', 'ep_1');
      expect(sentBody()).toEqual({ isDisabled: true });

      mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'ep_1' } }));
      await client.endpoints.enable('app_1', 'ep_1');
      expect(sentBody(1)).toEqual({ isDisabled: false });
    });
  });

  describe('POST /api/destinations', () => {
    const fullInput: CreateDestinationInput = {
      name: 'Acme Orders',
      slug: 'acme-orders',
      type: 'http',
      url: 'https://acme.example.com/hook',
      method: 'POST',
      headers: { 'X-Api-Key': 'k' },
      authType: 'bearer',
      authConfig: { token: 't0ken' },
      timeoutMs: 15000,
      throttle: { mode: 'rate', rateLimit: 10, rateUnit: 'second' },
      config: undefined,
      fieldMapping: [{ source: '$.id', target: 'event_id', type: 'string' }],
      useStaticIp: true,
      batchSize: 1,
      batchWindowSeconds: 0,
    };

    it('sends every accepted field under its exact API name, and nothing else', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ destination: { id: 'dst_1' } }, 201));

      await client.destinations.create(fullInput);

      expect(sentBody()).toEqual({
        name: 'Acme Orders',
        slug: 'acme-orders',
        type: 'http',
        url: 'https://acme.example.com/hook',
        method: 'POST',
        headers: { 'X-Api-Key': 'k' },
        authType: 'bearer',
        authConfig: { token: 't0ken' },
        timeoutMs: 15000,
        throttle: { mode: 'rate', rateLimit: 10, rateUnit: 'second' },
        fieldMapping: [{ source: '$.id', target: 'event_id', type: 'string' }],
        useStaticIp: true,
        batchSize: 1,
        batchWindowSeconds: 0,
      });
      // `config` is only sent for warehouse and queue types, so it is absent here.
      expect(
        Object.keys(sentBody()).every((k) =>
          (DESTINATION_CREATE_WIRE_FIELDS as readonly string[]).includes(k)
        )
      ).toBe(true);
    });

    it.each(DESTINATION_DEPRECATED_KEYS)('does not send %s', async (key) => {
      mockFetch.mockResolvedValueOnce(mockResponse({ destination: { id: 'dst_1' } }, 201));

      const deprecatedValues: Record<string, unknown> = {
        description: 'Acme production orders',
        timeout: 20000,
        retryCount: 3,
        retryInterval: 60,
      };

      await client.destinations.create({
        name: 'Acme Orders',
        slug: 'acme-orders',
        url: 'https://acme.example.com/hook',
        [key]: deprecatedValues[key],
      } as CreateDestinationInput);

      expect(sentBody()).not.toHaveProperty(key);
    });

    it('sends timeout as timeoutMs', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ destination: { id: 'dst_1' } }, 201));

      await client.destinations.create({
        name: 'Acme Orders',
        slug: 'acme-orders',
        url: 'https://acme.example.com/hook',
        timeout: 20000,
      });

      const body = sentBody();
      expect(body.timeoutMs).toBe(20000);
      expect(body).not.toHaveProperty('timeout');
    });

    it('lets timeoutMs win when both names are set', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ destination: { id: 'dst_1' } }, 201));

      await client.destinations.create({
        name: 'Acme Orders',
        slug: 'acme-orders',
        url: 'https://acme.example.com/hook',
        timeout: 20000,
        timeoutMs: 5000,
      });

      const body = sentBody();
      expect(body.timeoutMs).toBe(5000);
      expect(body).not.toHaveProperty('timeout');
    });

    it('derives a slug from the name when none is given', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ destination: { id: 'dst_1' } }, 201));

      await client.destinations.create({
        name: 'Acme Orders (EU) — Production!',
        url: 'https://acme.example.com/hook',
      });

      expect(sentBody().slug).toBe('acme-orders-eu-production');
      expect(sentBody().slug as string).toMatch(/^[a-z0-9-]+$/);
    });

    it.each([
      ['Acme Orders', 'acme-orders'],
      ['  Trailing and leading  ', 'trailing-and-leading'],
      ['Café EU', 'cafe-eu'],
      ['Multiple   ---   separators', 'multiple-separators'],
      ['UPPER_snake.case', 'upper-snake-case'],
      ['v2 API 2026', 'v2-api-2026'],
      ['already-a-slug', 'already-a-slug'],
    ])('derives %j as %j', async (name, expected) => {
      mockFetch.mockResolvedValueOnce(mockResponse({ destination: { id: 'dst_1' } }, 201));

      await client.destinations.create({ name, url: 'https://acme.example.com/hook' });

      const slug = sentBody().slug as string;
      expect(slug).toBe(expected);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    });

    // The cross-SDK slug contract. All four SDKs carry this exact table, so a change to any one
    // implementation shows up as a failure rather than as two SDKs quietly deriving different
    // slugs from the same destination name. Keep it identical to:
    //   python-sdk/tests/resources/test_destinations.py  (CROSS_SDK_SLUG_CASES)
    //   go-sdk/destinations_test.go                      (crossSDKSlugCases)
    //   dotnet-sdk/tests/.../DestinationSlugTests.cs     (CrossSdkSlugCases)
    // Note Æ/Ø/Đ/Ł do not decompose under NFKD and so are dropped rather than folded
    // ('Ærø Ømega' -> 'r-mega'); that is agreed-upon behaviour, not an accident to fix in
    // one SDK alone.
    it.each([
      ['Café EU', 'cafe-eu'],
      ['Acme Orders (EU)', 'acme-orders-eu'],
      ['My Backend (EU)', 'my-backend-eu'],
      ['  spaced  out  ', 'spaced-out'],
      ['UPPER CASE', 'upper-case'],
      ['ünïcödé nämes', 'unicode-names'],
      [
        'a-very-long-destination-name-that-runs-well-past-the-fifty-character-limit',
        'a-very-long-destination-name-that-runs-well-past-t',
      ],
      ['trailing---hyphens---', 'trailing-hyphens'],
      ['123 numeric', '123-numeric'],
      ['Ærø Ømega', 'r-mega'],
      ['\ufb01le ligature', 'file-ligature'],
      ['Mixed 123 ABC xyz', 'mixed-123-abc-xyz'],
      ["don't stop", 'don-t-stop'],
      ['a', 'a'],
      // A combining mark outside the U+0300-U+036F block. This row is why the strip is the whole
      // Mn category: with only the block, Node produced 'a-b' here while Python and .NET gave 'ab'.
      ['a\u064db', 'ab'],
      ['\u0939\u093f\u0928\u094d\u0926\u0940 name', 'name'],
    ])('cross-SDK contract: %j derives %j', (name, expected) => {
      expect(deriveDestinationSlug(name)).toBe(expected);
    });

    it('cross-SDK contract: a name with no alphanumerics throws', () => {
      expect(() => deriveDestinationSlug('\u2603\u2603\u2603')).toThrow(HookbaseError);
    });

    it('derives a slug of at most 50 characters', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ destination: { id: 'dst_1' } }, 201));

      await client.destinations.create({
        name: 'A very long destination name that runs well past the fifty character limit',
        url: 'https://acme.example.com/hook',
      });

      // Truncation is a plain cut at 50, which is what the other SDKs do, so the same name
      // derives the same slug everywhere. It can land mid-word; what it must not leave is a
      // trailing hyphen, which is why the cut is followed by one.
      const slug = sentBody().slug as string;
      expect(slug).toBe('a-very-long-destination-name-that-runs-well-past-t');
      expect(slug).toHaveLength(50);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    });

    it('leaves no trailing hyphen when truncation lands on a separator', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ destination: { id: 'dst_1' } }, 201));

      // 49 characters of slug, so the 50th character the cut keeps is a separator.
      await client.destinations.create({
        name: 'Webhook destination for the acme europe orders eu queue',
        url: 'https://acme.example.com/hook',
      });

      const slug = sentBody().slug as string;
      expect(slug).toBe('webhook-destination-for-the-acme-europe-orders-eu');
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(slug.endsWith('-')).toBe(false);
    });

    it('derives a slug when one is given as an empty string', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ destination: { id: 'dst_1' } }, 201));

      await client.destinations.create({
        name: 'Acme Orders',
        slug: '   ',
        url: 'https://acme.example.com/hook',
      });

      expect(sentBody().slug).toBe('acme-orders');
    });

    it('never rewrites a slug the caller supplied', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ destination: { id: 'dst_1' } }, 201));

      await client.destinations.create({
        name: 'Acme Orders',
        slug: 'legacy_Slug',
        url: 'https://acme.example.com/hook',
      });

      // Invalid for the API, and left alone on purpose: a 400 naming the field is better than
      // silently sending something other than what was asked for.
      expect(sentBody().slug).toBe('legacy_Slug');
    });

    it('explains itself when a name has nothing to derive a slug from', async () => {
      await expect(
        client.destinations.create({ name: '☃☃☃', url: 'https://acme.example.com/hook' })
      ).rejects.toThrow(HookbaseError);
      await expect(
        client.destinations.create({ name: '☃☃☃', url: 'https://acme.example.com/hook' })
      ).rejects.toThrow(/pass/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('keeps destination headers as a record', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ destination: { id: 'dst_1' } }, 201));

      await client.destinations.create({
        name: 'Acme Orders',
        url: 'https://acme.example.com/hook',
        headers: { 'X-Api-Key': 'k', Authorization: 'Bearer t0ken' },
      });

      expect(sentBody().headers).toEqual({ 'X-Api-Key': 'k', Authorization: 'Bearer t0ken' });
    });
  });

  describe('PATCH /api/destinations/:id', () => {
    it.each(DESTINATION_DEPRECATED_KEYS)('does not send %s', async (key) => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      const deprecatedValues: Record<string, unknown> = {
        description: 'Acme production orders',
        timeout: 20000,
        retryCount: 3,
        retryInterval: 60,
      };

      await client.destinations.update('dst_1', {
        name: 'Acme Orders',
        [key]: deprecatedValues[key],
      } as UpdateDestinationInput);

      expect(sentBody()).not.toHaveProperty(key);
      expect(sentBody().name).toBe('Acme Orders');
    });

    it('sends timeout as timeoutMs, and prefers timeoutMs', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));
      await client.destinations.update('dst_1', { timeout: 20000 });
      expect(sentBody()).toEqual({ timeoutMs: 20000 });

      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));
      await client.destinations.update('dst_1', { timeout: 20000, timeoutMs: 45000 });
      expect(sentBody(1)).toEqual({ timeoutMs: 45000 });
    });

    it('adds no slug to an update, since a slug cannot be changed', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await client.destinations.update('dst_1', { name: 'Renamed' });

      expect(sentBody()).toEqual({ name: 'Renamed' });
    });
  });
});
