import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign as ed25519Sign,
  timingSafeEqual,
  verify as ed25519Verify,
  type KeyObject,
} from 'node:crypto';
import { HookbaseWebhookVerificationError } from '../errors';
import type { SignatureScheme, VerifyOptions, WebhookHeaders } from '../types';

/**
 * Any header collection a webhook handler is likely to have: the plain `WebhookHeaders` object,
 * Node's `IncomingHttpHeaders` (`req.headers` in Express/Fastify/http, whose values may be
 * `string[] | undefined`), or a Fetch API `Headers` instance (Next.js, Hono, Workers, Deno).
 */
export type WebhookHeadersInput =
  | WebhookHeaders
  | Headers
  | Record<string, string | string[] | undefined>;

/** The raw request body: a string, or the bytes of it (e.g. `express.raw()`'s Buffer). */
export type WebhookPayload = string | Uint8Array;

const DEFAULT_TOLERANCE = 300; // 5 minutes

/** Standard Webhooks Ed25519 public key prefix: `whpk_<base64 of the 32-byte key>`. */
const ED25519_PUBLIC_KEY_PREFIX = 'whpk_';
/** Standard Webhooks Ed25519 secret key prefix: `whsk_<base64 of seed (32) || public key (32)>`. */
const ED25519_SECRET_KEY_PREFIX = 'whsk_';

/** The `webhook-signature` entry version each scheme signs with. */
const SIGNATURE_VERSION: Record<SignatureScheme, string> = {
  'hmac-sha256': 'v1',
  ed25519: 'v1a',
};

/**
 * Webhook verification and parsing utilities.
 *
 * The scheme is picked from the key you construct it with, the same way the Hookbase API picks it:
 * - `whsec_...` (the endpoint's signing secret): verifies `v1` (HMAC-SHA256) signatures.
 * - `whpk_...` (an `ed25519` endpoint's public key): verifies `v1a` (Ed25519) signatures. A public
 *   key cannot sign, so `sign` and `generateTestHeaders` throw.
 * - `whsk_...` (an Ed25519 secret key, e.g. one you generated for tests): verifies `v1a` with its
 *   public half, and can also sign test headers.
 */
export class Webhook {
  private secret: string;
  /** The signature scheme this instance verifies, decided by the key's prefix. */
  readonly scheme: SignatureScheme;
  private ed25519PublicKey?: KeyObject;
  private ed25519PrivateKey?: KeyObject;

  constructor(secret: string) {
    if (!secret) {
      throw new Error('Webhook secret is required');
    }
    this.secret = secret;

    if (secret.startsWith(ED25519_PUBLIC_KEY_PREFIX)) {
      this.scheme = 'ed25519';
      this.ed25519PublicKey = importEd25519PublicKey(secret);
    } else if (secret.startsWith(ED25519_SECRET_KEY_PREFIX)) {
      this.scheme = 'ed25519';
      this.ed25519PrivateKey = importEd25519SecretKey(secret);
      this.ed25519PublicKey = createPublicKey(this.ed25519PrivateKey);
    } else {
      this.scheme = 'hmac-sha256';
    }
  }

  /**
   * Verify and parse a webhook payload
   *
   * @param payload - The raw request body as a string
   * @param headers - The webhook headers (webhook-id, webhook-timestamp, webhook-signature)
   * @param options - Verification options
   * @returns The parsed payload
   * @throws {HookbaseWebhookVerificationError} If verification fails
   */
  verify<T = Record<string, unknown>>(
    payload: WebhookPayload,
    headers: WebhookHeadersInput,
    options: VerifyOptions = {}
  ): T {
    const { tolerance = DEFAULT_TOLERANCE } = options;
    const body = payloadToString(payload);

    // Normalize headers (case-insensitive)
    const normalizedHeaders = normalizeHeaders(headers);

    const webhookId = normalizedHeaders['webhook-id'];
    const webhookTimestamp = normalizedHeaders['webhook-timestamp'];
    const webhookSignature = normalizedHeaders['webhook-signature'];

    if (!webhookId) {
      throw new HookbaseWebhookVerificationError('Missing webhook-id header');
    }

    if (!webhookTimestamp) {
      throw new HookbaseWebhookVerificationError(
        'Missing webhook-timestamp header'
      );
    }

    if (!webhookSignature) {
      throw new HookbaseWebhookVerificationError(
        'Missing webhook-signature header'
      );
    }

    // Verify timestamp is within tolerance
    this.verifyTimestamp(webhookTimestamp, tolerance);

    // Verify signature
    this.verifySignature(body, webhookId, webhookTimestamp, webhookSignature);

    // Parse and return payload
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new HookbaseWebhookVerificationError('Invalid JSON payload');
    }
  }

  /**
   * Verify only the webhook signature without parsing
   *
   * @param payload - The raw request body as a string
   * @param headers - The webhook headers
   * @param options - Verification options
   * @returns true if verification succeeds
   * @throws {HookbaseWebhookVerificationError} If verification fails
   */
  verifySignature(
    payload: WebhookPayload,
    webhookId: string,
    webhookTimestamp: string,
    webhookSignature: string
  ): boolean {
    // Build the signed content
    const signedContent = `${webhookId}.${webhookTimestamp}.${payloadToString(payload)}`;

    // Parse signatures (may have multiple versions)
    const signatures = parseSignatures(webhookSignature);

    if (signatures.length === 0) {
      throw new HookbaseWebhookVerificationError('No valid signatures found');
    }

    if (this.scheme === 'ed25519') {
      return this.verifyEd25519(signedContent, signatures);
    }

    // Compute expected signature
    const expectedSignature = this.sign(signedContent);

    // Check each signature version
    for (const sig of signatures) {
      if (sig.version === 'v1') {
        try {
          const expectedBuffer = Buffer.from(expectedSignature, 'base64');
          const actualBuffer = Buffer.from(sig.signature, 'base64');

          if (
            expectedBuffer.length === actualBuffer.length &&
            timingSafeEqual(expectedBuffer, actualBuffer)
          ) {
            return true;
          }
        } catch {
          // Continue to next signature
        }
      }
    }

    throw verificationFailed('hmac-sha256', signatures);
  }

  /**
   * `v1a` entries: accept if any of them verifies against the public key. Several entries appear
   * while a rotated key is in its grace period (`v1a,<old> v1a,<new>`).
   */
  private verifyEd25519(signedContent: string, signatures: ParsedSignature[]): boolean {
    const data = Buffer.from(signedContent, 'utf8');

    for (const sig of signatures) {
      if (sig.version !== 'v1a') continue;
      try {
        const signature = Buffer.from(sig.signature, 'base64');
        // Buffer's base64 decoder skips junk and stops at padding; accept only the canonical
        // encoding of a 64-byte signature, which is what the API sends.
        if (
          signature.length === 64 &&
          signature.toString('base64') === sig.signature &&
          ed25519Verify(null, data, this.ed25519PublicKey!, signature)
        ) {
          return true;
        }
      } catch {
        // Continue to next signature
      }
    }

    throw verificationFailed('ed25519', signatures);
  }

  /**
   * Sign content for testing purposes: HMAC-SHA256 with a `whsec_` secret, Ed25519 with a `whsk_`
   * secret key. A `whpk_` public key cannot sign, so this throws for one.
   *
   * @param signedContent - `{webhook-id}.{webhook-timestamp}.{payload}`
   * @returns The base64 signature, without the `v1,` / `v1a,` prefix
   */
  sign(signedContent: string): string {
    if (this.scheme === 'ed25519') {
      if (!this.ed25519PrivateKey) {
        throw new Error(
          'Cannot sign with an Ed25519 public key (whpk_). Construct the Webhook with a whsk_ secret key to generate test signatures.'
        );
      }
      return ed25519Sign(null, Buffer.from(signedContent, 'utf8'), this.ed25519PrivateKey).toString('base64');
    }

    const hmac = createHmac('sha256', this.decodeSecret());
    hmac.update(signedContent);
    return hmac.digest('base64');
  }

  /**
   * Generate test headers for a payload
   * Useful for testing webhook handlers
   *
   * @param payload - The payload to sign
   * @param options - Options for generating headers
   * @returns The webhook headers
   */
  generateTestHeaders(
    payload: string,
    options: { webhookId?: string; timestamp?: number } = {}
  ): WebhookHeaders {
    const webhookId = options.webhookId ?? `msg_${generateId()}`;
    const timestamp =
      options.timestamp ?? Math.floor(Date.now() / 1000).toString();

    const signedContent = `${webhookId}.${timestamp}.${payload}`;
    const signature = this.sign(signedContent);

    return {
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp.toString(),
      'webhook-signature': `${SIGNATURE_VERSION[this.scheme]},${signature}`,
    };
  }

  private verifyTimestamp(timestamp: string, tolerance: number): void {
    const now = Math.floor(Date.now() / 1000);
    // Whole seconds only: parseInt read "1700000000abc" (or "1.7e9") as a valid timestamp.
    const webhookTime = /^\d+$/.test(timestamp.trim()) ? parseInt(timestamp, 10) : NaN;

    if (isNaN(webhookTime)) {
      throw new HookbaseWebhookVerificationError('Invalid timestamp format');
    }

    const diff = Math.abs(now - webhookTime);

    if (diff > tolerance) {
      throw new HookbaseWebhookVerificationError(
        `Webhook timestamp is outside tolerance (${diff}s > ${tolerance}s)`
      );
    }
  }

  private decodeSecret(): Buffer {
    // The same decoding the API signs with (api/src/utils/outbound-signature.ts decodeSecret):
    // strip `whsec_`, plus the `op_` infix operational-webhook secrets carry
    // (`whsec_op_<base64>`); a 64-character hex remainder is a legacy secret and is the hex
    // bytes; anything else is base64. Decoding `op_...` or a hex secret as base64 produced the
    // wrong key, so every signature from those secrets failed to verify.
    const raw = this.secret.replace(/^whsec_(op_)?/, '');
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    return Buffer.from(raw, 'base64');
  }
}

/** Decode `whpk_<base64>` (32 raw bytes) into a public KeyObject. */
function importEd25519PublicKey(publicKey: string): KeyObject {
  const raw = Buffer.from(publicKey.slice(ED25519_PUBLIC_KEY_PREFIX.length), 'base64');
  if (raw.length !== 32) {
    throw new Error(`Ed25519 public key (whpk_) must be 32 bytes, got ${raw.length}`);
  }
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
    format: 'jwk',
  });
}

/** Decode `whsk_<base64>` (32-byte seed followed by the 32-byte public key) into a private KeyObject. */
function importEd25519SecretKey(secretKey: string): KeyObject {
  const raw = Buffer.from(secretKey.slice(ED25519_SECRET_KEY_PREFIX.length), 'base64');
  if (raw.length !== 64) {
    throw new Error(`Ed25519 secret key (whsk_) must be 64 bytes (seed || public key), got ${raw.length}`);
  }
  return createPrivateKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      d: raw.subarray(0, 32).toString('base64url'),
      x: raw.subarray(32).toString('base64url'),
    },
    format: 'jwk',
  });
}

/**
 * The failure error. When the header has no entry of the version this key verifies, say so: that
 * is a key/scheme mismatch (e.g. a `whsec_` secret for an endpoint that signs `v1a`), not tampering.
 */
function verificationFailed(
  scheme: SignatureScheme,
  signatures: ParsedSignature[]
): HookbaseWebhookVerificationError {
  const expected = SIGNATURE_VERSION[scheme];
  if (!signatures.some((sig) => sig.version === expected)) {
    const other: SignatureScheme = scheme === 'ed25519' ? 'hmac-sha256' : 'ed25519';
    const keyHint = other === 'ed25519' ? "the endpoint's whpk_ public key" : "the endpoint's whsec_ secret";
    const hint = signatures.some((sig) => sig.version === SIGNATURE_VERSION[other])
      ? ` The endpoint signs with ${other} (${SIGNATURE_VERSION[other]}); verify with ${keyHint}.`
      : '';
    return new HookbaseWebhookVerificationError(
      `Webhook signature verification failed: no ${expected} signature in the header.${hint}`
    );
  }
  return new HookbaseWebhookVerificationError('Webhook signature verification failed');
}

interface ParsedSignature {
  version: string;
  signature: string;
}

function parseSignatures(signatureHeader: string): ParsedSignature[] {
  const signatures: ParsedSignature[] = [];

  for (const part of signatureHeader.split(' ')) {
    const [version, signature] = part.split(',');
    if (version && signature) {
      signatures.push({ version, signature });
    }
  }

  return signatures;
}

function normalizeHeaders(headers: WebhookHeadersInput): Record<string, string> {
  const normalized: Record<string, string> = {};

  // A Fetch `Headers` keeps its entries internally: Object.entries() on one is empty, so every
  // header read as missing.
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value;
    });
    return normalized;
  }

  for (const [key, value] of Object.entries(headers as Record<string, string | string[] | undefined>)) {
    if (value === undefined) continue;
    // Node joins repeated headers into an array; signatures may arrive split across them.
    normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(' ') : value;
  }

  return normalized;
}

function payloadToString(payload: WebhookPayload): string {
  if (typeof payload === 'string') return payload;
  return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).toString('utf8');
}

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Create a webhook verifier instance
 *
 * @param secret - The endpoint's signing secret (`whsec_...`), or for an `ed25519` endpoint its
 *   public key (`whpk_...`, the endpoint's `publicKey`)
 * @returns A Webhook instance for verifying webhooks
 *
 * @example
 * ```ts
 * import { createWebhook } from '@hookbase/sdk';
 *
 * const webhook = createWebhook('whsec_...');
 *
 * // In your webhook handler
 * const payload = webhook.verify(req.body, req.headers);
 *
 * // Ed25519 (v1a) endpoint: verify with its public key
 * const v1a = createWebhook('whpk_...');
 * ```
 */
export function createWebhook(secret: string): Webhook {
  return new Webhook(secret);
}
