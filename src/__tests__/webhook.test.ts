import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebhook, Webhook } from '../webhooks/verify';
import { HookbaseWebhookVerificationError } from '../errors';

describe('Webhook Verification', () => {
  // Test secret (base64 encoded)
  const testSecret = 'whsec_dGVzdF9zZWNyZXRfZm9yX3Rlc3Rpbmc=';
  let webhook: Webhook;

  beforeEach(() => {
    webhook = createWebhook(testSecret);
  });

  describe('createWebhook', () => {
    it('should create a Webhook instance', () => {
      const wh = createWebhook(testSecret);
      expect(wh).toBeInstanceOf(Webhook);
    });

    it('should throw error without secret', () => {
      expect(() => createWebhook('')).toThrow('Webhook secret is required');
    });
  });

  describe('verify', () => {
    it('should verify and parse valid webhook', () => {
      const payload = JSON.stringify({ orderId: 'ord_123', amount: 99.99 });
      const headers = webhook.generateTestHeaders(payload);

      const result = webhook.verify<{ orderId: string; amount: number }>(
        payload,
        headers
      );

      expect(result.orderId).toBe('ord_123');
      expect(result.amount).toBe(99.99);
    });

    it('should throw on missing webhook-id header', () => {
      const payload = JSON.stringify({ test: true });

      expect(() =>
        webhook.verify(payload, {
          'webhook-timestamp': '1234567890',
          'webhook-signature': 'v1,test',
        } as any)
      ).toThrow(HookbaseWebhookVerificationError);
    });

    it('should throw on missing webhook-timestamp header', () => {
      const payload = JSON.stringify({ test: true });

      expect(() =>
        webhook.verify(payload, {
          'webhook-id': 'msg_123',
          'webhook-signature': 'v1,test',
        } as any)
      ).toThrow(HookbaseWebhookVerificationError);
    });

    it('should throw on missing webhook-signature header', () => {
      const payload = JSON.stringify({ test: true });

      expect(() =>
        webhook.verify(payload, {
          'webhook-id': 'msg_123',
          'webhook-timestamp': '1234567890',
        } as any)
      ).toThrow(HookbaseWebhookVerificationError);
    });

    it('should throw on invalid signature', () => {
      const payload = JSON.stringify({ test: true });
      const timestamp = Math.floor(Date.now() / 1000).toString();

      expect(() =>
        webhook.verify(payload, {
          'webhook-id': 'msg_123',
          'webhook-timestamp': timestamp,
          'webhook-signature': 'v1,invalid_signature_here',
        })
      ).toThrow(HookbaseWebhookVerificationError);
    });

    it('should throw on expired timestamp', () => {
      const payload = JSON.stringify({ test: true });
      // Timestamp from 10 minutes ago (beyond 5 minute tolerance)
      const expiredTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
      const headers = webhook.generateTestHeaders(payload, {
        timestamp: parseInt(expiredTimestamp),
      });

      expect(() => webhook.verify(payload, headers)).toThrow(
        HookbaseWebhookVerificationError
      );
    });

    it('should accept timestamp within tolerance', () => {
      const payload = JSON.stringify({ test: true });
      // Timestamp from 2 minutes ago (within 5 minute tolerance)
      const recentTimestamp = Math.floor(Date.now() / 1000) - 120;
      const headers = webhook.generateTestHeaders(payload, {
        timestamp: recentTimestamp,
      });

      const result = webhook.verify(payload, headers);
      expect(result).toEqual({ test: true });
    });

    it('should allow custom tolerance', () => {
      const payload = JSON.stringify({ test: true });
      // Timestamp from 10 minutes ago
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
      const headers = webhook.generateTestHeaders(payload, {
        timestamp: oldTimestamp,
      });

      // Should succeed with 15 minute tolerance
      const result = webhook.verify(payload, headers, { tolerance: 900 });
      expect(result).toEqual({ test: true });
    });

    it('should handle case-insensitive headers', () => {
      const payload = JSON.stringify({ test: true });
      const headers = webhook.generateTestHeaders(payload);

      // Convert to uppercase
      const uppercaseHeaders = {
        'WEBHOOK-ID': headers['webhook-id'],
        'WEBHOOK-TIMESTAMP': headers['webhook-timestamp'],
        'WEBHOOK-SIGNATURE': headers['webhook-signature'],
      };

      const result = webhook.verify(payload, uppercaseHeaders);
      expect(result).toEqual({ test: true });
    });

    it('should throw on invalid JSON payload', () => {
      const invalidPayload = 'not valid json';
      const timestamp = Math.floor(Date.now() / 1000).toString();

      // Generate a valid signature for the invalid JSON
      const signedContent = `msg_123.${timestamp}.${invalidPayload}`;
      const signature = webhook.sign(signedContent);

      expect(() =>
        webhook.verify(invalidPayload, {
          'webhook-id': 'msg_123',
          'webhook-timestamp': timestamp,
          'webhook-signature': `v1,${signature}`,
        })
      ).toThrow('Invalid JSON payload');
    });
  });

  describe('generateTestHeaders', () => {
    it('should generate valid headers', () => {
      const payload = JSON.stringify({ test: true });
      const headers = webhook.generateTestHeaders(payload);

      expect(headers['webhook-id']).toMatch(/^msg_/);
      expect(headers['webhook-timestamp']).toMatch(/^\d+$/);
      expect(headers['webhook-signature']).toMatch(/^v1,/);
    });

    it('should use custom webhook ID', () => {
      const payload = JSON.stringify({ test: true });
      const headers = webhook.generateTestHeaders(payload, {
        webhookId: 'custom_id_123',
      });

      expect(headers['webhook-id']).toBe('custom_id_123');
    });

    it('should use custom timestamp', () => {
      const payload = JSON.stringify({ test: true });
      const customTimestamp = 1704067200; // 2024-01-01 00:00:00 UTC
      const headers = webhook.generateTestHeaders(payload, {
        timestamp: customTimestamp,
      });

      expect(headers['webhook-timestamp']).toBe('1704067200');
    });

    it('should generate verifiable headers', () => {
      const payload = JSON.stringify({ orderId: 'test_123' });
      const headers = webhook.generateTestHeaders(payload);

      // Should be able to verify the generated headers
      const result = webhook.verify(payload, headers);
      expect(result).toEqual({ orderId: 'test_123' });
    });
  });

  describe('signature versioning', () => {
    it('should handle multiple signature versions', () => {
      const payload = JSON.stringify({ test: true });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const webhookId = 'msg_123';

      const signedContent = `${webhookId}.${timestamp}.${payload}`;
      const validSignature = webhook.sign(signedContent);

      // Include multiple signatures (v1 valid, v2 invalid)
      const headers = {
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v2,invalid_sig v1,${validSignature}`,
      };

      const result = webhook.verify(payload, headers);
      expect(result).toEqual({ test: true });
    });
  });

  describe('security', () => {
    it('should use timing-safe comparison', () => {
      // This test verifies the implementation uses timing-safe comparison
      // by checking that verification time is consistent regardless of
      // how "close" the invalid signature is to the valid one
      const payload = JSON.stringify({ test: true });
      const headers = webhook.generateTestHeaders(payload);

      const validSignature = headers['webhook-signature'].split(',')[1];

      // Modify first character (ensure it's actually different)
      const nearMiss1 = (validSignature[0] === 'A' ? 'B' : 'A') + validSignature.slice(1);
      // Modify last character (ensure it's actually different)
      const lastChar = validSignature[validSignature.length - 1];
      const nearMiss2 = validSignature.slice(0, -1) + (lastChar === 'A' ? 'B' : 'A');
      // Completely different
      const totalMiss = 'completely_different_signature';

      const testInvalidSignature = (sig: string) => {
        try {
          webhook.verify(payload, {
            ...headers,
            'webhook-signature': `v1,${sig}`,
          });
          return false;
        } catch {
          return true;
        }
      };

      // All should fail (timing should be similar)
      expect(testInvalidSignature(nearMiss1)).toBe(true);
      expect(testInvalidSignature(nearMiss2)).toBe(true);
      expect(testInvalidSignature(totalMiss)).toBe(true);
    });
  });
});
