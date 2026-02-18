/**
 * Hookbase SDK Integration Test Script
 *
 * Exercises every method on every resource in the SDK against the live API.
 * Similar to the Postman integration test collection, but using the Node.js SDK.
 *
 * Usage:
 *   HOOKBASE_API_KEY=whr_xxx npx tsx scripts/integration-test.ts
 *   HOOKBASE_API_KEY=whr_xxx HOOKBASE_BASE_URL=http://localhost:8787 npx tsx scripts/integration-test.ts
 */

import {
  Hookbase,
  createClient,
  Webhook,
  createWebhook,
  HookbaseNotFoundError,
  HookbaseValidationError,
  HookbaseWebhookVerificationError,
  HookbaseApiError,
} from '../src/index';

// ─── Configuration ──────────────────────────────────────────────

const API_KEY = process.env.HOOKBASE_API_KEY;
const BASE_URL = process.env.HOOKBASE_BASE_URL || 'https://api.hookbase.app';
const DEBUG = process.env.DEBUG === 'true';

if (!API_KEY) {
  console.error('Error: HOOKBASE_API_KEY environment variable is required');
  console.error('Usage: HOOKBASE_API_KEY=whr_xxx npx tsx scripts/integration-test.ts');
  process.exit(1);
}

// ─── Test Runner ────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];
let currentSection = '';

function section(name: string) {
  currentSection = name;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(60));
}

async function test(name: string, fn: () => Promise<void>) {
  const fullName = `${currentSection} > ${name}`;
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name: fullName, passed: true, duration });
    console.log(`  PASS  ${name} (${duration}ms)`);
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name: fullName, passed: false, error: message, duration });
    console.log(`  FAIL  ${name} (${duration}ms)`);
    console.log(`        ${message}`);
    if (DEBUG && err instanceof Error && err.stack) {
      console.log(`        ${err.stack.split('\n').slice(1, 3).join('\n        ')}`);
    }
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertDefined<T>(value: T | null | undefined, name: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${name} to be defined, got ${value}`);
  }
}

function assertType(value: unknown, type: string, name: string) {
  if (typeof value !== type) {
    throw new Error(`Expected ${name} to be ${type}, got ${typeof value}`);
  }
}

// ─── State ──────────────────────────────────────────────────────

const testRun = Math.random().toString(36).substring(2, 8);
const state: Record<string, string> = {};

// ─── Initialize Client ─────────────────────────────────────────

const hookbase = new Hookbase({
  apiKey: API_KEY,
  baseUrl: BASE_URL,
  debug: DEBUG,
  retries: 1,
  timeout: 15000,
});

// ─── Tests ──────────────────────────────────────────────────────

async function runTests() {
  console.log(`\nHookbase SDK Integration Tests`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Run: ${testRun}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // ─── Client Initialization ──────────────────────────────────

  section('Client Initialization');

  await test('createClient() factory function works', async () => {
    const client = createClient({ apiKey: API_KEY!, baseUrl: BASE_URL });
    assertDefined(client.applications, 'client.applications');
    assertDefined(client.endpoints, 'client.endpoints');
    assertDefined(client.eventTypes, 'client.eventTypes');
    assertDefined(client.subscriptions, 'client.subscriptions');
    assertDefined(client.messages, 'client.messages');
    assertDefined(client.portalTokens, 'client.portalTokens');
  });

  await test('Hookbase constructor rejects missing API key', async () => {
    let threw = false;
    try {
      new Hookbase({ apiKey: '' });
    } catch {
      threw = true;
    }
    assert(threw, 'Should throw on empty API key');
  });

  // ─── Applications ──────────────────────────────────────────

  section('Applications');

  await test('applications.create()', async () => {
    const app = await hookbase.applications.create({
      name: `SDK Test App ${testRun}`,
      uid: `sdk-test-${testRun}`,
      metadata: { testRun, source: 'integration-test' },
    });
    assertDefined(app.id, 'app.id');
    assert(app.name === `SDK Test App ${testRun}`, `name mismatch: ${app.name}`);
    assertDefined(app.createdAt, 'app.createdAt');
    state.appId = app.id;
  });

  await test('applications.get()', async () => {
    const app = await hookbase.applications.get(state.appId);
    assert(app.id === state.appId, 'ID mismatch');
    assert(app.name === `SDK Test App ${testRun}`, 'name mismatch');
  });

  await test('applications.getByUid()', async () => {
    const app = await hookbase.applications.getByUid(`sdk-test-${testRun}`);
    assert(app.id === state.appId, 'ID mismatch');
  });

  await test('applications.update()', async () => {
    const app = await hookbase.applications.update(state.appId, {
      name: `SDK Test App ${testRun} Updated`,
      metadata: { testRun, updated: true },
    });
    assert(app.name === `SDK Test App ${testRun} Updated`, 'name not updated');
  });

  await test('applications.list()', async () => {
    const response = await hookbase.applications.list({ limit: 10 });
    assertDefined(response.data, 'response.data');
    assert(Array.isArray(response.data), 'data should be an array');
    assert(response.data.length > 0, 'should have at least 1 application');
  });

  await test('applications.list() with search', async () => {
    const response = await hookbase.applications.list({
      search: `SDK Test App ${testRun}`,
      limit: 5,
    });
    assert(response.data.length >= 1, 'search should find our test app');
  });

  await test('applications.listAll() async iterator', async () => {
    let count = 0;
    for await (const app of hookbase.applications.listAll({ limit: 5 })) {
      assertDefined(app.id, 'app.id');
      count++;
      if (count >= 3) break;
    }
    assert(count >= 1, 'should iterate at least 1 application');
  });

  await test('applications.getOrCreate() - upsert existing', async () => {
    const app = await hookbase.applications.getOrCreate(`sdk-test-${testRun}`, {
      name: `SDK Test App ${testRun} Updated`,
    });
    assert(app.id === state.appId, 'should return existing app');
  });

  await test('applications.getOrCreate() - upsert new', async () => {
    const uid = `sdk-goc-${testRun}`;
    const app = await hookbase.applications.getOrCreate(uid, {
      name: `SDK GetOrCreate ${testRun}`,
    });
    assertDefined(app.id, 'app.id');
    state.appId2 = app.id;
  });

  // ─── Event Types ───────────────────────────────────────────

  section('Event Types');

  await test('eventTypes.create()', async () => {
    const et = await hookbase.eventTypes.create({
      name: `order.created.${testRun}`,
      displayName: 'Order Created',
      description: 'Triggered when a new order is placed',
      category: 'orders',
      schema: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['orderId'],
      },
    });
    assertDefined(et.id, 'eventType.id');
    assert(et.name === `order.created.${testRun}`, 'name mismatch');
    state.eventTypeId = et.id;
  });

  await test('eventTypes.create() second event type', async () => {
    const et = await hookbase.eventTypes.create({
      name: `order.updated.${testRun}`,
      displayName: 'Order Updated',
      category: 'orders',
    });
    state.eventTypeId2 = et.id;
  });

  await test('eventTypes.create() third event type', async () => {
    const et = await hookbase.eventTypes.create({
      name: `payment.completed.${testRun}`,
      displayName: 'Payment Completed',
      category: 'payments',
    });
    state.eventTypeId3 = et.id;
  });

  await test('eventTypes.get()', async () => {
    const et = await hookbase.eventTypes.get(state.eventTypeId);
    assert(et.id === state.eventTypeId, 'ID mismatch');
    assert(et.name === `order.created.${testRun}`, 'name mismatch');
  });

  await test('eventTypes.getByName()', async () => {
    const et = await hookbase.eventTypes.getByName(`order.created.${testRun}`);
    assert(et.id === state.eventTypeId, 'ID mismatch');
  });

  await test('eventTypes.update()', async () => {
    const et = await hookbase.eventTypes.update(state.eventTypeId, {
      description: 'Updated by SDK integration test',
    });
    assert(et.description === 'Updated by SDK integration test', 'description not updated');
  });

  await test('eventTypes.list()', async () => {
    const response = await hookbase.eventTypes.list({ limit: 10 });
    assert(Array.isArray(response.data), 'data should be an array');
    assert(response.data.length > 0, 'should have event types');
  });

  await test('eventTypes.list() with category filter', async () => {
    const response = await hookbase.eventTypes.list({
      category: 'orders',
      limit: 10,
    });
    for (const et of response.data) {
      assert(et.category === 'orders', `expected category 'orders', got '${et.category}'`);
    }
  });

  await test('eventTypes.listAll() async iterator', async () => {
    let count = 0;
    for await (const et of hookbase.eventTypes.listAll({ limit: 5 })) {
      assertDefined(et.id, 'et.id');
      count++;
      if (count >= 3) break;
    }
    assert(count >= 1, 'should iterate at least 1 event type');
  });

  await test('eventTypes.archive()', async () => {
    const et = await hookbase.eventTypes.archive(state.eventTypeId3);
    // archive() disables the event type (isEnabled: false)
    assert(et.isEnabled === false || (et as any).isEnabled === 0, 'should be archived (disabled)');
  });

  await test('eventTypes.unarchive()', async () => {
    const et = await hookbase.eventTypes.unarchive(state.eventTypeId3);
    assert(et.isEnabled === true || (et as any).isEnabled === 1, 'should be unarchived (enabled)');
  });

  await test('eventTypes.getOrCreate() - existing', async () => {
    const et = await hookbase.eventTypes.getOrCreate(`order.created.${testRun}`, {
      displayName: 'Should Not Change',
    });
    assert(et.id === state.eventTypeId, 'should return existing');
  });

  await test('eventTypes.getOrCreate() - new', async () => {
    const et = await hookbase.eventTypes.getOrCreate(`invoice.paid.${testRun}`, {
      displayName: 'Invoice Paid',
      category: 'billing',
    });
    assertDefined(et.id, 'et.id');
    state.eventTypeId4 = et.id;
  });

  // ─── Endpoints ─────────────────────────────────────────────

  section('Endpoints');

  await test('endpoints.create()', async () => {
    const ep = await hookbase.endpoints.create(state.appId, {
      url: 'https://httpbin.org/post',
      description: `SDK test endpoint ${testRun}`,
    });
    assertDefined(ep.id, 'endpoint.id');
    assertDefined(ep.secret, 'endpoint.secret');
    assert(ep.url === 'https://httpbin.org/post', 'URL mismatch');
    state.endpointId = ep.id;
    state.endpointSecret = ep.secret;
  });

  await test('endpoints.create() second endpoint', async () => {
    const ep = await hookbase.endpoints.create(state.appId, {
      url: 'https://httpbin.org/anything',
      description: `SDK test endpoint 2 ${testRun}`,
    });
    state.endpointId2 = ep.id;
  });

  await test('endpoints.get()', async () => {
    const ep = await hookbase.endpoints.get(state.appId, state.endpointId);
    assert(ep.id === state.endpointId, 'ID mismatch');
  });

  await test('endpoints.update()', async () => {
    const ep = await hookbase.endpoints.update(state.appId, state.endpointId, {
      description: 'Updated by SDK integration test',
    });
    assert(ep.description === 'Updated by SDK integration test', 'description not updated');
  });

  await test('endpoints.list()', async () => {
    const response = await hookbase.endpoints.list(state.appId, { limit: 10 });
    assert(Array.isArray(response.data), 'data should be an array');
    assert(response.data.length >= 2, `should have at least 2 endpoints, got ${response.data.length}`);
  });

  await test('endpoints.listAll() async iterator', async () => {
    let count = 0;
    for await (const ep of hookbase.endpoints.listAll(state.appId, { limit: 5 })) {
      assertDefined(ep.id, 'ep.id');
      count++;
    }
    assert(count >= 2, 'should iterate at least 2 endpoints');
  });

  await test('endpoints.disable()', async () => {
    const ep = await hookbase.endpoints.disable(state.appId, state.endpointId);
    assert(ep.isDisabled === true, 'should be disabled');
  });

  await test('endpoints.enable()', async () => {
    const ep = await hookbase.endpoints.enable(state.appId, state.endpointId);
    assert(ep.isDisabled === false, 'should be enabled');
  });

  await test('endpoints.rotateSecret()', async () => {
    const result = await hookbase.endpoints.rotateSecret(state.appId, state.endpointId);
    assertDefined(result.secret, 'new secret');
    assert(result.secret !== state.endpointSecret, 'secret should have changed');
    state.endpointSecret = result.secret;
  });

  await test('endpoints.getStats()', async () => {
    const stats = await hookbase.endpoints.getStats(state.appId, state.endpointId);
    assertType(stats.totalMessages, 'number', 'totalMessages');
    assertType(stats.totalSuccesses, 'number', 'totalSuccesses');
    assertType(stats.totalFailures, 'number', 'totalFailures');
    assertType(stats.successRate, 'number', 'successRate');
  });

  await test('endpoints.recoverCircuit()', async () => {
    const ep = await hookbase.endpoints.recoverCircuit(state.appId, state.endpointId);
    assertDefined(ep.id, 'endpoint.id');
  });

  await test('endpoints.test()', async () => {
    const result = await hookbase.endpoints.test(state.appId, state.endpointId);
    assertDefined(result, 'test result');
  });

  // ─── Subscriptions ─────────────────────────────────────────

  section('Subscriptions');

  await test('subscriptions.create()', async () => {
    const sub = await hookbase.subscriptions.create(state.appId, {
      endpointId: state.endpointId,
      eventTypeId: state.eventTypeId,
    });
    assertDefined(sub.id, 'subscription.id');
    assert(sub.endpointId === state.endpointId, 'endpointId mismatch');
    assert(sub.eventTypeId === state.eventTypeId, 'eventTypeId mismatch');
    state.subscriptionId = sub.id;
  });

  await test('subscriptions.get()', async () => {
    const sub = await hookbase.subscriptions.get(state.appId, state.subscriptionId);
    assert(sub.id === state.subscriptionId, 'ID mismatch');
  });

  await test('subscriptions.update() - disable', async () => {
    const sub = await hookbase.subscriptions.update(state.appId, state.subscriptionId, {
      isEnabled: false,
    });
    assert(sub.isEnabled === false, 'should be disabled');
  });

  await test('subscriptions.enable()', async () => {
    const sub = await hookbase.subscriptions.enable(state.appId, state.subscriptionId);
    assert(sub.isEnabled === true, 'should be enabled');
  });

  await test('subscriptions.disable()', async () => {
    const sub = await hookbase.subscriptions.disable(state.appId, state.subscriptionId);
    assert(sub.isEnabled === false, 'should be disabled');
    // Re-enable for later message tests
    await hookbase.subscriptions.enable(state.appId, state.subscriptionId);
  });

  await test('subscriptions.list()', async () => {
    const response = await hookbase.subscriptions.list(state.appId, { limit: 10 });
    assert(Array.isArray(response.data), 'data should be an array');
    assert(response.data.length >= 1, 'should have at least 1 subscription');
  });

  await test('subscriptions.list() with endpointId filter', async () => {
    const response = await hookbase.subscriptions.list(state.appId, {
      endpointId: state.endpointId,
      limit: 10,
    });
    for (const sub of response.data) {
      assert(sub.endpointId === state.endpointId, 'endpointId mismatch');
    }
  });

  await test('subscriptions.listAll() async iterator', async () => {
    let count = 0;
    for await (const sub of hookbase.subscriptions.listAll(state.appId, { limit: 5 })) {
      assertDefined(sub.id, 'sub.id');
      count++;
    }
    assert(count >= 1, 'should iterate at least 1 subscription');
  });

  await test('subscriptions.subscribeToMany()', async () => {
    const subs = await hookbase.subscriptions.subscribeToMany(
      state.appId,
      state.endpointId2,
      [state.eventTypeId, state.eventTypeId2]
    );
    assert(subs.length >= 1, `should create subscriptions, got ${subs.length}`);
  });

  await test('subscriptions.unsubscribeAll()', async () => {
    // Need to get subscriptions for this endpoint filtering by app
    await hookbase.subscriptions.unsubscribeAll(state.appId, state.endpointId2);
    const response = await hookbase.subscriptions.list(state.appId, {
      endpointId: state.endpointId2,
    });
    assert(response.data.length === 0, `should have 0 subscriptions, got ${response.data.length}`);
  });

  // ─── Messages ──────────────────────────────────────────────

  section('Messages');

  await test('messages.send()', async () => {
    const result = await hookbase.messages.send(state.appId, {
      eventType: `order.created.${testRun}`,
      payload: {
        orderId: `ord_${testRun}`,
        amount: 99.99,
        currency: 'USD',
        customer: { name: 'Test User', email: 'test@example.com' },
      },
    });
    assertDefined(result.messageId, 'messageId');
    state.messageId = result.messageId;
  });

  await test('messages.send() with idempotency key', async () => {
    const idempotencyKey = `idem_${testRun}_${Date.now()}`;
    const result = await hookbase.messages.send(
      state.appId,
      {
        eventType: `order.created.${testRun}`,
        payload: { orderId: `ord_${testRun}_idem`, amount: 50.0 },
      },
      { idempotencyKey }
    );
    assertDefined(result.messageId, 'messageId');
  });

  // Wait a moment for messages to be queued
  await new Promise((r) => setTimeout(r, 2000));

  await test('messages.list()', async () => {
    const response = await hookbase.messages.list(state.appId, { limit: 10 });
    assert(Array.isArray(response.data), 'data should be an array');
  });

  await test('messages.listAllOutbound()', async () => {
    const response = await hookbase.messages.listAllOutbound(state.appId, { limit: 10 });
    assert(Array.isArray(response.data), 'data should be an array');
    if (response.data.length > 0) {
      state.outboundMessageId = response.data[0].id;
    }
  });

  if (state.outboundMessageId) {
    await test('messages.get()', async () => {
      const msg = await hookbase.messages.get(state.appId, state.outboundMessageId);
      assert(msg.id === state.outboundMessageId, 'ID mismatch');
    });

    await test('messages.getOutbound()', async () => {
      const ob = await hookbase.messages.getOutbound(state.appId, state.outboundMessageId);
      assert(ob.id === state.outboundMessageId, 'ID mismatch');
    });

    await test('messages.listAttempts()', async () => {
      const attempts = await hookbase.messages.listAttempts(
        state.appId,
        state.outboundMessageId
      );
      assert(Array.isArray(attempts), 'attempts should be an array');
    });
  }

  await test('messages.listAll() async iterator', async () => {
    let count = 0;
    for await (const msg of hookbase.messages.listAll(state.appId, { limit: 5 })) {
      assertDefined(msg.id, 'msg.id');
      count++;
      if (count >= 3) break;
    }
    // May be 0 if no outbound messages yet
  });

  // ─── Portal Tokens ─────────────────────────────────────────

  section('Portal Tokens');

  await test('portalTokens.create()', async () => {
    const token = await hookbase.portalTokens.create(state.appId, {
      name: `SDK Test Token ${testRun}`,
      expiresInDays: 7,
    });
    assertDefined(token.id, 'token.id');
    assertDefined(token.token, 'token.token');
    state.portalTokenId = token.id;
  });

  await test('portalTokens.create() with default params', async () => {
    const token = await hookbase.portalTokens.create(state.appId);
    assertDefined(token.id, 'token.id');
    state.portalTokenId2 = token.id;
  });

  await test('portalTokens.list()', async () => {
    const tokens = await hookbase.portalTokens.list(state.appId);
    assert(Array.isArray(tokens), 'should be an array');
    assert(tokens.length >= 2, `should have at least 2 tokens, got ${tokens.length}`);
  });

  await test('portalTokens.revoke()', async () => {
    await hookbase.portalTokens.revoke(state.appId, state.portalTokenId2);
  });

  // ─── Webhook Verification ──────────────────────────────────

  section('Webhook Verification');

  await test('Webhook constructor', async () => {
    const wh = new Webhook('whsec_dGVzdHNlY3JldA==');
    assertDefined(wh, 'webhook instance');
  });

  await test('Webhook constructor rejects empty secret', async () => {
    let threw = false;
    try {
      new Webhook('');
    } catch {
      threw = true;
    }
    assert(threw, 'Should throw on empty secret');
  });

  await test('createWebhook() factory function', async () => {
    const wh = createWebhook('whsec_dGVzdHNlY3JldA==');
    assertDefined(wh, 'webhook instance');
  });

  await test('webhook.generateTestHeaders()', async () => {
    const wh = new Webhook('whsec_dGVzdHNlY3JldA==');
    const payload = JSON.stringify({ test: true });
    const headers = wh.generateTestHeaders(payload);
    assertDefined(headers['webhook-id'], 'webhook-id');
    assertDefined(headers['webhook-timestamp'], 'webhook-timestamp');
    assertDefined(headers['webhook-signature'], 'webhook-signature');
    assert(headers['webhook-signature'].startsWith('v1,'), 'signature should start with v1,');
  });

  await test('webhook.verify() with valid signature', async () => {
    const wh = new Webhook('whsec_dGVzdHNlY3JldA==');
    const payload = JSON.stringify({ orderId: 'ord_123', amount: 99.99 });
    const headers = wh.generateTestHeaders(payload);
    const parsed = wh.verify<{ orderId: string; amount: number }>(payload, headers);
    assert(parsed.orderId === 'ord_123', 'orderId mismatch');
    assert(parsed.amount === 99.99, 'amount mismatch');
  });

  await test('webhook.verify() with custom tolerance', async () => {
    const wh = new Webhook('whsec_dGVzdHNlY3JldA==');
    const payload = JSON.stringify({ test: true });
    const headers = wh.generateTestHeaders(payload);
    const parsed = wh.verify(payload, headers, { tolerance: 600 });
    assert((parsed as Record<string, unknown>).test === true, 'parsed value mismatch');
  });

  await test('webhook.verify() rejects invalid signature', async () => {
    const wh = new Webhook('whsec_dGVzdHNlY3JldA==');
    const payload = JSON.stringify({ test: true });
    const headers = wh.generateTestHeaders(payload);
    headers['webhook-signature'] = 'v1,invalidsignature==';
    let threw = false;
    try {
      wh.verify(payload, headers);
    } catch (err) {
      threw = true;
      assert(err instanceof HookbaseWebhookVerificationError, 'should be verification error');
    }
    assert(threw, 'Should throw on invalid signature');
  });

  await test('webhook.verify() rejects tampered payload', async () => {
    const wh = new Webhook('whsec_dGVzdHNlY3JldA==');
    const payload = JSON.stringify({ test: true });
    const headers = wh.generateTestHeaders(payload);
    let threw = false;
    try {
      wh.verify(JSON.stringify({ test: false }), headers);
    } catch (err) {
      threw = true;
      assert(err instanceof HookbaseWebhookVerificationError, 'should be verification error');
    }
    assert(threw, 'Should throw on tampered payload');
  });

  await test('webhook.verify() rejects expired timestamp', async () => {
    const wh = new Webhook('whsec_dGVzdHNlY3JldA==');
    const payload = JSON.stringify({ test: true });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const headers = wh.generateTestHeaders(payload, { timestamp: oldTimestamp });
    let threw = false;
    try {
      wh.verify(payload, headers, { tolerance: 300 });
    } catch (err) {
      threw = true;
      assert(err instanceof HookbaseWebhookVerificationError, 'should be verification error');
    }
    assert(threw, 'Should throw on expired timestamp');
  });

  await test('webhook.verify() rejects missing headers', async () => {
    const wh = new Webhook('whsec_dGVzdHNlY3JldA==');
    let threw = false;
    try {
      wh.verify('{}', {} as any);
    } catch (err) {
      threw = true;
      assert(err instanceof HookbaseWebhookVerificationError, 'should be verification error');
    }
    assert(threw, 'Should throw on missing headers');
  });

  await test('webhook.verify() handles case-insensitive headers', async () => {
    const wh = new Webhook('whsec_dGVzdHNlY3JldA==');
    const payload = JSON.stringify({ caseTest: true });
    const headers = wh.generateTestHeaders(payload);
    const uppercaseHeaders: Record<string, string> = {
      'Webhook-Id': headers['webhook-id'],
      'Webhook-Timestamp': headers['webhook-timestamp'],
      'Webhook-Signature': headers['webhook-signature'],
    };
    const parsed = wh.verify(payload, uppercaseHeaders);
    assert((parsed as Record<string, unknown>).caseTest === true, 'should parse correctly');
  });

  await test('webhook.sign() produces consistent output', async () => {
    const wh = new Webhook('whsec_dGVzdHNlY3JldA==');
    const content = 'msg_123.1234567890.{"test":true}';
    const sig1 = wh.sign(content);
    const sig2 = wh.sign(content);
    assert(sig1 === sig2, 'signatures should be deterministic');
    assert(sig1.length > 0, 'signature should not be empty');
  });

  // ─── Error Handling ────────────────────────────────────────

  section('Error Handling');

  await test('HookbaseNotFoundError on invalid resource', async () => {
    let threw = false;
    try {
      await hookbase.applications.get('nonexistent_app_id_xyz');
    } catch (err) {
      threw = true;
      assert(err instanceof HookbaseApiError, `expected ApiError, got ${(err as Error).constructor.name}`);
    }
    assert(threw, 'Should throw on not found');
  });

  await test('Request with AbortSignal cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    let threw = false;
    try {
      await hookbase.applications.list({ limit: 1 }, { signal: controller.signal });
    } catch {
      threw = true;
    }
    assert(threw, 'Should throw on aborted signal');
  });

  // ─── Cleanup ───────────────────────────────────────────────

  section('Cleanup');

  await test('subscriptions.delete()', async () => {
    if (state.subscriptionId) {
      await hookbase.subscriptions.delete(state.appId, state.subscriptionId);
    }
  });

  await test('endpoints.delete()', async () => {
    if (state.endpointId) {
      await hookbase.endpoints.delete(state.appId, state.endpointId);
    }
    if (state.endpointId2) {
      await hookbase.endpoints.delete(state.appId, state.endpointId2);
    }
  });

  await test('portalTokens.revoke() remaining token', async () => {
    if (state.portalTokenId) {
      await hookbase.portalTokens.revoke(state.appId, state.portalTokenId);
    }
  });

  await test('eventTypes.delete()', async () => {
    for (const key of ['eventTypeId', 'eventTypeId2', 'eventTypeId3', 'eventTypeId4']) {
      if (state[key]) {
        try {
          await hookbase.eventTypes.delete(state[key]);
        } catch {
          // May already be deleted
        }
      }
    }
  });

  await test('applications.delete()', async () => {
    if (state.appId) {
      await hookbase.applications.delete(state.appId);
    }
  });

  await test('applications.delete() second app', async () => {
    if (state.appId2) {
      await hookbase.applications.delete(state.appId2);
    }
  });

  // ─── Summary ───────────────────────────────────────────────

  printSummary();
}

function printSummary() {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n${'='.repeat(60)}`);
  console.log('  Test Summary');
  console.log('='.repeat(60));
  console.log(`  Total:    ${total}`);
  console.log(`  Passed:   ${passed}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  FAIL  ${r.name}`);
      console.log(`        ${r.error}`);
    }
    console.log('');
    process.exit(1);
  } else {
    console.log(`\nAll ${total} tests passed!\n`);
  }
}

// ─── Run ────────────────────────────────────────────────────────

runTests().catch((err) => {
  console.error('\nFatal error:', err);
  printSummary();
  process.exit(1);
});
