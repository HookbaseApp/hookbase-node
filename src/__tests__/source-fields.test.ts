import { describe, it, expect } from 'vitest';
import type { CreateSourceInput, UpdateSourceInput, Source, SourceWithSecret } from '../types';

/**
 * The field names this SDK puts on the wire, as POST/PATCH /api/sources accept them.
 *
 * These lists exist because they were wrong for months and nothing said so. The SDK's types named
 * `verifySignature`, `dedupWindow`, `dedupHeaderName`, `rateLimit` and `rateLimitWindow`; the API's
 * create schema was a plain zod object, which strips unknown keys rather than refusing them, so
 * every one of those calls returned 201 having quietly dropped the setting. A source created with
 * `verifySignature: true` came back with verification off and raised no error.
 *
 * The create schema is strict now, so a stale name is a 400 rather than a silent drop — which is
 * why a rename here has to be deliberate.
 */
const CREATE_FIELDS = [
  'name', 'slug', 'provider', 'description', 'signingSecret', 'rejectInvalidSignatures',
  'rateLimitPerMinute', 'ipFilterMode', 'ipAllowlist', 'ipDenylist', 'encryptFields',
  'maskFields', 'dedupEnabled', 'dedupStrategy', 'dedupWindowHours', 'dedupCustomHeader',
  'transientMode', 'allowedMethods',
] as const;

const UPDATE_FIELDS = [
  'name', 'description', 'provider', 'isActive', 'signingSecret', 'rejectInvalidSignatures',
  'rateLimitPerMinute', 'ipFilterMode', 'ipAllowlist', 'ipDenylist', 'encryptFields',
  'maskFields', 'dedupEnabled', 'dedupStrategy', 'dedupWindowHours', 'dedupCustomHeader',
  'transientMode', 'allowedMethods',
] as const;

// Interfaces are erased at runtime, so the check has to be a type-level one: these objects are
// exhaustive by construction, and tsc fails the build if a key is missing, misspelled or surplus.
const FULL_CREATE: Required<{ [K in typeof CREATE_FIELDS[number]]: CreateSourceInput[K] }> = {
  name: 'Stripe Production',
  slug: 'stripe',
  provider: 'stripe',
  description: 'Live charge events',
  signingSecret: 'whsec_abc',
  rejectInvalidSignatures: true,
  rateLimitPerMinute: 600,
  ipFilterMode: 'allowlist',
  ipAllowlist: ['203.0.113.0/24'],
  ipDenylist: [],
  encryptFields: ['$.data.object.customer_email'],
  maskFields: ['$.data.object.last4'],
  dedupEnabled: true,
  dedupStrategy: 'provider_id',
  dedupWindowHours: 24,
  dedupCustomHeader: 'X-Idempotency-Key',
  transientMode: false,
  allowedMethods: ['POST'],
};

const FULL_UPDATE: Required<{ [K in typeof UPDATE_FIELDS[number]]: UpdateSourceInput[K] }> = {
  name: 'Stripe Production',
  description: null,
  provider: 'stripe',
  isActive: false,
  signingSecret: null,
  rejectInvalidSignatures: true,
  rateLimitPerMinute: null,
  ipFilterMode: 'none',
  ipAllowlist: null,
  ipDenylist: null,
  encryptFields: null,
  maskFields: null,
  dedupEnabled: false,
  dedupStrategy: null,
  dedupWindowHours: null,
  dedupCustomHeader: null,
  transientMode: false,
  allowedMethods: [],
};

describe('the fields this SDK sends are the fields the API accepts', () => {
  it('a fully populated create input has exactly the documented keys', () => {
    expect(Object.keys(FULL_CREATE).sort()).toEqual([...CREATE_FIELDS].sort());
  });

  it('a fully populated update input has exactly the documented keys', () => {
    expect(Object.keys(FULL_UPDATE).sort()).toEqual([...UPDATE_FIELDS].sort());
  });

  it('create and update differ only by slug and isActive', () => {
    expect(CREATE_FIELDS.filter((f) => !UPDATE_FIELDS.includes(f as never))).toEqual(['slug']);
    expect(UPDATE_FIELDS.filter((f) => !CREATE_FIELDS.includes(f as never))).toEqual(['isActive']);
  });

  // slug is part of the ingest URL and cannot be changed afterwards, so create requires it.
  it('create requires a slug', () => {
    // @ts-expect-error - slug is not optional
    const missing: CreateSourceInput = { name: 'No slug' };
    expect(missing.name).toBe('No slug');
  });

  // Every other response masks the secret. Only create hands back the full value.
  it('a listed source exposes the masked pair, not the secret', () => {
    const source = { hasSigningSecret: true, signingSecretLast4: '...c123' } as Source;
    expect(source.hasSigningSecret).toBe(true);
    // @ts-expect-error - Source has no signingSecret; SourceWithSecret does
    expect(source.signingSecret).toBeUndefined();
  });

  it('a created source exposes the secret and the ingest URL', () => {
    const created = {
      signingSecret: 'whsec_abc',
      ingestUrl: 'https://api.hookbase.app/ingest/acme/stripe',
    } as SourceWithSecret;
    expect(created.signingSecret).toBe('whsec_abc');
    expect(created.ingestUrl).toContain('/ingest/');
  });
});
