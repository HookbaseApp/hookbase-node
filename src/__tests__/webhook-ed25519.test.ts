import { createHmac, webcrypto } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { createWebhook, Webhook } from '../webhooks/verify';
import { HookbaseWebhookVerificationError } from '../errors';

/**
 * The signer below mirrors the Hookbase API (api/src/utils/outbound-signature.ts) line for line:
 * WebCrypto Ed25519, the key pair serialized as `whsk_<base64 seed||pub>` / `whpk_<base64 pub>`,
 * the signed content `{messageId}.{timestamp}.{payload}`, entries `v1a,<base64 sig>`, and during a
 * rotation grace period `<previous> <current>` space-separated, previous first. Signing with
 * WebCrypto while the SDK verifies with node:crypto keeps the test from agreeing with itself.
 */
const ED25519 = { name: 'Ed25519' } as const;

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const b64urlToBytes = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

async function generateEd25519KeyPair(): Promise<{ secretKey: string; publicKey: string }> {
  const pair = (await webcrypto.subtle.generateKey(ED25519, true, ['sign', 'verify'])) as webcrypto.CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
  const seed = b64urlToBytes(jwk.d!);
  const pub = b64urlToBytes(jwk.x!);
  const combined = new Uint8Array(64);
  combined.set(seed, 0);
  combined.set(pub, 32);
  return { secretKey: `whsk_${b64(combined)}`, publicKey: `whpk_${b64(pub)}` };
}

async function computeEd25519Signature(
  timestamp: number,
  payload: string,
  secretKey: string,
  messageId: string
): Promise<string> {
  const bytes = Buffer.from(secretKey.slice('whsk_'.length), 'base64');
  const key = await webcrypto.subtle.importKey(
    'jwk',
    {
      kty: 'OKP',
      crv: 'Ed25519',
      d: bytes.subarray(0, 32).toString('base64url'),
      x: bytes.subarray(32).toString('base64url'),
    },
    ED25519,
    false,
    ['sign']
  );
  const data = new TextEncoder().encode(`${messageId}.${timestamp}.${payload}`);
  return b64(new Uint8Array(await webcrypto.subtle.sign(ED25519, key, data)));
}

function computeHmacSignature(timestamp: number, payload: string, secret: string, messageId: string): string {
  return createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64'))
    .update(`${messageId}.${timestamp}.${payload}`)
    .digest('base64');
}

/** signOutboundPayload: one entry per key, the previous key's entry first. */
async function signLikeServer(
  messageId: string,
  timestamp: number,
  payload: string,
  key: string,
  previousKey?: string
): Promise<Record<string, string>> {
  const entry = async (k: string) =>
    k.startsWith('whsk_')
      ? `v1a,${await computeEd25519Signature(timestamp, payload, k, messageId)}`
      : `v1,${computeHmacSignature(timestamp, payload, k, messageId)}`;
  const sig = await entry(key);
  const prev = previousKey && previousKey !== key ? await entry(previousKey) : null;
  return {
    'webhook-id': messageId,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': prev ? `${prev} ${sig}` : sig,
  };
}

const now = () => Math.floor(Date.now() / 1000);
const HMAC_SECRET = 'whsec_dGVzdF9zZWNyZXRfZm9yX3Rlc3Rpbmc=';
const payload = JSON.stringify({ type: 'order.created', data: { id: 'ord_1', note: 'naïve ✓' } });

describe('Webhook verification: Ed25519 (v1a)', () => {
  let current: { secretKey: string; publicKey: string };
  let previous: { secretKey: string; publicKey: string };
  let other: { secretKey: string; publicKey: string };

  beforeAll(async () => {
    [current, previous, other] = await Promise.all([
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
    ]);
  });

  it('picks the scheme from the key prefix', () => {
    expect(createWebhook(current.publicKey).scheme).toBe('ed25519');
    expect(createWebhook(current.secretKey).scheme).toBe('ed25519');
    expect(createWebhook(HMAC_SECRET).scheme).toBe('hmac-sha256');
  });

  it('verifies a server-signed v1a delivery with the whpk_ public key', async () => {
    const headers = await signLikeServer('wh_msg_1', now(), payload, current.secretKey);
    expect(headers['webhook-signature']).toMatch(/^v1a,[A-Za-z0-9+/]{86}==$/);

    const result = createWebhook(current.publicKey).verify<{ type: string }>(payload, headers);
    expect(result.type).toBe('order.created');
  });

  it('verifies with the public half of a whsk_ secret key too', async () => {
    const headers = await signLikeServer('wh_msg_1', now(), payload, current.secretKey);
    expect(() => createWebhook(current.secretKey).verify(payload, headers)).not.toThrow();
  });

  it('accepts mixed-case header names', async () => {
    const headers = await signLikeServer('wh_msg_1', now(), payload, current.secretKey);
    const upper = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toUpperCase(), v]));
    expect(() => createWebhook(current.publicKey).verify(payload, upper)).not.toThrow();
  });

  it('rejects a signature made with a different key', async () => {
    const headers = await signLikeServer('wh_msg_1', now(), payload, other.secretKey);
    expect(() => createWebhook(current.publicKey).verify(payload, headers)).toThrow(
      new HookbaseWebhookVerificationError('Webhook signature verification failed')
    );
  });

  it('rejects a tampered payload', async () => {
    const headers = await signLikeServer('wh_msg_1', now(), payload, current.secretKey);
    expect(() => createWebhook(current.publicKey).verify(payload.replace('ord_1', 'ord_2'), headers)).toThrow(
      HookbaseWebhookVerificationError
    );
  });

  it('rejects a tampered webhook-id or timestamp', async () => {
    const ts = now();
    const headers = await signLikeServer('wh_msg_1', ts, payload, current.secretKey);
    const webhook = createWebhook(current.publicKey);
    expect(() => webhook.verify(payload, { ...headers, 'webhook-id': 'wh_msg_2' })).toThrow(
      HookbaseWebhookVerificationError
    );
    expect(() => webhook.verify(payload, { ...headers, 'webhook-timestamp': String(ts - 1) })).toThrow(
      HookbaseWebhookVerificationError
    );
  });

  it('rejects an expired timestamp even with a valid signature', async () => {
    const ts = now() - 301;
    const headers = await signLikeServer('wh_msg_1', ts, payload, current.secretKey);
    expect(() => createWebhook(current.publicKey).verify(payload, headers)).toThrow(/outside tolerance/);
    // A wider tolerance accepts the same delivery: the signature itself is good.
    expect(() => createWebhook(current.publicKey).verify(payload, headers, { tolerance: 600 })).not.toThrow();
  });

  it('rejects a timestamp too far in the future', async () => {
    const headers = await signLikeServer('wh_msg_1', now() + 301, payload, current.secretKey);
    expect(() => createWebhook(current.publicKey).verify(payload, headers)).toThrow(/outside tolerance/);
  });

  it('accepts either key during a rotation grace period (v1a,<old> v1a,<new>)', async () => {
    const headers = await signLikeServer('wh_msg_1', now(), payload, current.secretKey, previous.secretKey);
    const entries = headers['webhook-signature'].split(' ');
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.startsWith('v1a,'))).toBe(true);

    expect(() => createWebhook(previous.publicKey).verify(payload, headers)).not.toThrow();
    expect(() => createWebhook(current.publicKey).verify(payload, headers)).not.toThrow();
    expect(() => createWebhook(other.publicKey).verify(payload, headers)).toThrow(HookbaseWebhookVerificationError);
  });

  it('handles a mixed v1 + v1a header: each key verifies only its own entry', async () => {
    // e.g. right after an endpoint switches scheme, or a header from a proxy that re-signs.
    const ts = now();
    const v1 = await signLikeServer('wh_msg_1', ts, payload, HMAC_SECRET);
    const v1a = await signLikeServer('wh_msg_1', ts, payload, current.secretKey);
    const mixed = { ...v1, 'webhook-signature': `${v1['webhook-signature']} ${v1a['webhook-signature']}` };
    const mixedReversed = { ...v1, 'webhook-signature': `${v1a['webhook-signature']} ${v1['webhook-signature']}` };

    for (const headers of [mixed, mixedReversed]) {
      expect(() => createWebhook(current.publicKey).verify(payload, headers)).not.toThrow();
      expect(() => createWebhook(HMAC_SECRET).verify(payload, headers)).not.toThrow();
      expect(() => createWebhook(other.publicKey).verify(payload, headers)).toThrow(HookbaseWebhookVerificationError);
    }
  });

  it('does not accept a v1a signature presented as v1, or the reverse', async () => {
    const ts = now();
    const v1a = await signLikeServer('wh_msg_1', ts, payload, current.secretKey);
    const asV1 = { ...v1a, 'webhook-signature': v1a['webhook-signature'].replace(/^v1a,/, 'v1,') };
    expect(() => createWebhook(current.publicKey).verify(payload, asV1)).toThrow(HookbaseWebhookVerificationError);
  });

  it('explains a scheme mismatch instead of reporting a bad signature', async () => {
    const ts = now();
    const v1a = await signLikeServer('wh_msg_1', ts, payload, current.secretKey);
    expect(() => createWebhook(HMAC_SECRET).verify(payload, v1a)).toThrow(
      /no v1 signature in the header\. The endpoint signs with ed25519 \(v1a\); verify with the endpoint's whpk_ public key/
    );

    const v1 = await signLikeServer('wh_msg_1', ts, payload, HMAC_SECRET);
    expect(() => createWebhook(current.publicKey).verify(payload, v1)).toThrow(
      /no v1a signature in the header\. The endpoint signs with hmac-sha256 \(v1\); verify with the endpoint's whsec_ secret/
    );
  });

  it('rejects malformed v1a entries without throwing anything but a verification error', async () => {
    const headers = await signLikeServer('wh_msg_1', now(), payload, current.secretKey);
    const webhook = createWebhook(current.publicKey);
    const sig = headers['webhook-signature'].slice('v1a,'.length);
    for (const bad of ['v1a,', 'v1a,!!!!', `v1a,${sig.slice(0, 40)}`, `v1a,${sig}AAAA`]) {
      expect(() => webhook.verify(payload, { ...headers, 'webhook-signature': bad })).toThrow(
        HookbaseWebhookVerificationError
      );
    }
  });

  it('rejects a malformed key at construction', () => {
    expect(() => new Webhook('whpk_AAAA')).toThrow(/must be 32 bytes/);
    expect(() => new Webhook(`whsk_${Buffer.alloc(32).toString('base64')}`)).toThrow(/must be 64 bytes/);
  });

  it('generateTestHeaders signs v1a with a whsk_ key, verifiable by the public key', async () => {
    const headers = createWebhook(current.secretKey).generateTestHeaders(payload);
    expect(headers['webhook-signature']).toMatch(/^v1a,/);
    expect(() => createWebhook(current.publicKey).verify(payload, headers)).not.toThrow();

    // And the SDK's signature is byte-identical to the server's (Ed25519 is deterministic).
    const server = await signLikeServer(headers['webhook-id'], Number(headers['webhook-timestamp']), payload, current.secretKey);
    expect(headers['webhook-signature']).toBe(server['webhook-signature']);
  });

  it('cannot sign with a whpk_ public key', () => {
    expect(() => createWebhook(current.publicKey).generateTestHeaders(payload)).toThrow(/Cannot sign with an Ed25519 public key/);
  });

  it('leaves HMAC (v1) verification unchanged', async () => {
    const headers = await signLikeServer('wh_msg_1', now(), payload, HMAC_SECRET);
    expect(headers['webhook-signature']).toMatch(/^v1,/);
    expect(() => createWebhook(HMAC_SECRET).verify(payload, headers)).not.toThrow();
    expect(createWebhook(HMAC_SECRET).generateTestHeaders(payload)['webhook-signature']).toMatch(/^v1,/);
  });
});
