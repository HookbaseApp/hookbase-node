import { createHmac, timingSafeEqual } from 'node:crypto';
import { HookbaseWebhookVerificationError } from '../errors';
import type { VerifyOptions, WebhookHeaders } from '../types';

const DEFAULT_TOLERANCE = 300; // 5 minutes

/**
 * Webhook verification and parsing utilities
 */
export class Webhook {
  private secret: string;

  constructor(secret: string) {
    if (!secret) {
      throw new Error('Webhook secret is required');
    }
    this.secret = secret;
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
    payload: string,
    headers: WebhookHeaders | Record<string, string>,
    options: VerifyOptions = {}
  ): T {
    const { tolerance = DEFAULT_TOLERANCE } = options;

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
    this.verifySignature(payload, webhookId, webhookTimestamp, webhookSignature);

    // Parse and return payload
    try {
      return JSON.parse(payload) as T;
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
    payload: string,
    webhookId: string,
    webhookTimestamp: string,
    webhookSignature: string
  ): boolean {
    // Build the signed content
    const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;

    // Parse signatures (may have multiple versions)
    const signatures = parseSignatures(webhookSignature);

    if (signatures.length === 0) {
      throw new HookbaseWebhookVerificationError('No valid signatures found');
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

    throw new HookbaseWebhookVerificationError(
      'Webhook signature verification failed'
    );
  }

  /**
   * Generate a signature for testing purposes
   *
   * @param payload - The payload to sign
   * @param webhookId - The webhook ID
   * @param timestamp - The timestamp (defaults to current time)
   * @returns The signature string
   */
  sign(signedContent: string): string {
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
      'webhook-signature': `v1,${signature}`,
    };
  }

  private verifyTimestamp(timestamp: string, tolerance: number): void {
    const now = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(timestamp, 10);

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
    // Secret may be base64 encoded or raw
    const prefix = 'whsec_';
    let secretStr = this.secret;

    if (secretStr.startsWith(prefix)) {
      secretStr = secretStr.slice(prefix.length);
    }

    return Buffer.from(secretStr, 'base64');
  }
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

function normalizeHeaders(
  headers: WebhookHeaders | Record<string, string>
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }

  return normalized;
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
 * @param secret - The webhook signing secret (from endpoint creation)
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
 * ```
 */
export function createWebhook(secret: string): Webhook {
  return new Webhook(secret);
}
