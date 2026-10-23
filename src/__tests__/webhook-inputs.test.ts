import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { createWebhook, Webhook } from '../webhooks/verify';
import { HookbaseWebhookVerificationError } from '../errors';

const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';

describe('webhook verification inputs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifies the Standard Webhooks reference vector', () => {
    // From the Standard Webhooks spec test suite: proves the HMAC scheme (key decoding, signed
    // content, encoding) is interoperable with every other Standard Webhooks implementation.
    vi.useFakeTimers();
    vi.setSystemTime(1614265330 * 1000);
    const wh = new Webhook(secret);
    const payload = '{"test": 2432232314}';
    const result = wh.verify(payload, {
      'webhook-id': 'msg_p5jXN8AQM9LWM0D4loKWxJek',
      'webhook-timestamp': '1614265330',
      'webhook-signature': 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
    });
    expect(result).toEqual({ test: 2432232314 });
  });

  it('matches a signature computed the way the API signer does', () => {
    // api/src/utils/outbound-signature.ts: HMAC-SHA256(base64-decoded key, `${id}.${ts}.${payload}`).
    const ts = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ event: 'order.created', data: { id: 1 } });
    const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
    const sig = createHmac('sha256', key).update(`wh_msg_1.${ts}.${payload}`).digest('base64');
    const result = createWebhook(secret).verify(payload, {
      'webhook-id': 'wh_msg_1',
      'webhook-timestamp': String(ts),
      'webhook-signature': `v1,${sig}`,
    });
    expect(result).toEqual({ event: 'order.created', data: { id: 1 } });
  });

  it('accepts a Fetch API Headers instance', () => {
    const wh = createWebhook(secret);
    const payload = '{"a":1}';
    const h = wh.generateTestHeaders(payload);
    const headers = new Headers({
      'Webhook-Id': h['webhook-id'],
      'Webhook-Timestamp': h['webhook-timestamp'],
      'Webhook-Signature': h['webhook-signature'],
    });
    expect(wh.verify(payload, headers)).toEqual({ a: 1 });
  });

  it("accepts Node's IncomingHttpHeaders (array and undefined values)", () => {
    const wh = createWebhook(secret);
    const payload = '{"a":1}';
    const h = wh.generateTestHeaders(payload);
    const other = createWebhook('whsec_' + Buffer.alloc(32, 7).toString('base64'));
    const otherSig = other.generateTestHeaders(payload, {
      webhookId: h['webhook-id'],
      timestamp: Number(h['webhook-timestamp']),
    })['webhook-signature'];
    const headers: Record<string, string | string[] | undefined> = {
      'webhook-id': h['webhook-id'],
      'webhook-timestamp': h['webhook-timestamp'],
      // Repeated header lines: Node hands them over as an array.
      'webhook-signature': [otherSig, h['webhook-signature']],
      'x-not-present': undefined,
    };
    expect(wh.verify(payload, headers)).toEqual({ a: 1 });
  });

  it('accepts the raw body as a Buffer / Uint8Array', () => {
    const wh = createWebhook(secret);
    const payload = '{"name":"café"}';
    const headers = wh.generateTestHeaders(payload);
    expect(wh.verify(Buffer.from(payload, 'utf8'), headers)).toEqual({ name: 'café' });
    const bytes = new TextEncoder().encode(payload);
    expect(wh.verify(bytes, headers)).toEqual({ name: 'café' });
    expect(wh.verifySignature(bytes, headers['webhook-id'], headers['webhook-timestamp'], headers['webhook-signature'])).toBe(true);
  });

  it('rejects a timestamp too far in the future (HMAC)', () => {
    const wh = createWebhook(secret);
    const payload = '{}';
    const headers = wh.generateTestHeaders(payload, { timestamp: Math.floor(Date.now() / 1000) + 600 });
    expect(() => wh.verify(payload, headers)).toThrow(/outside tolerance/);
  });

  it('rejects a non-numeric or partly numeric timestamp', () => {
    const wh = createWebhook(secret);
    const payload = '{}';
    const now = Math.floor(Date.now() / 1000);
    for (const ts of [`${now}abc`, '1.7e9', 'abc', `-${now}`]) {
      const headers = wh.generateTestHeaders(payload, { webhookId: 'msg_1' });
      // Re-sign with the odd timestamp so only the timestamp check can fail.
      const sig = wh.sign(`msg_1.${ts}.${payload}`);
      expect(() =>
        wh.verify(payload, { ...headers, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` })
      ).toThrow('Invalid timestamp format');
    }
  });

  it('rejects a header with no parsable entries', () => {
    const wh = createWebhook(secret);
    const headers = wh.generateTestHeaders('{}');
    expect(() => wh.verify('{}', { ...headers, 'webhook-signature': 'garbage' })).toThrow(
      'No valid signatures found'
    );
  });

  it('rejects a signature made with a different whsec_ secret', () => {
    const other = createWebhook('whsec_' + Buffer.alloc(32, 1).toString('base64'));
    const headers = other.generateTestHeaders('{}');
    expect(() => createWebhook(secret).verify('{}', headers)).toThrow(HookbaseWebhookVerificationError);
  });

  it('ignores signature entries of unknown versions', () => {
    const wh = createWebhook(secret);
    const headers = wh.generateTestHeaders('{}');
    const sig = headers['webhook-signature'].split(',')[1];
    expect(() => wh.verify('{}', { ...headers, 'webhook-signature': `v2,${sig}` })).toThrow(
      HookbaseWebhookVerificationError
    );
  });
});
