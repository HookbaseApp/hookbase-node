# @hookbase/sdk

Official Node.js SDK for [Hookbase](https://hookbase.app) - the webhook management platform.

## Installation

```bash
npm install @hookbase/sdk
```

Requires Node.js 18 or later. Ships ES module and CommonJS builds.

## Quick Start

```typescript
import { Hookbase } from '@hookbase/sdk';

const hookbase = new Hookbase({
  apiKey: 'whr_your_api_key',
});

// Send a webhook
await hookbase.messages.send('app_123', {
  eventType: 'order.created',
  payload: {
    orderId: 'ord_123',
    amount: 99.99,
  },
});
```

## Features

- **Full API Coverage**: Access all Hookbase API endpoints
- **TypeScript First**: Complete type definitions
- **Webhook Verification**: Verify incoming webhook signatures
- **Automatic Retries**: Retries that never repeat an unsafe request (see [Retries](#retries))
- **Pagination Helpers**: Async iterators for large datasets
- **Error Handling**: Specific error classes for different failure modes

## API Reference

### Client Initialization

```typescript
import { Hookbase, createClient } from '@hookbase/sdk';

// Option 1: Constructor
const hookbase = new Hookbase({
  apiKey: process.env.HOOKBASE_API_KEY!,
  baseUrl: 'https://api.hookbase.app', // Optional
  timeout: 30000, // Optional: 30 seconds
  retries: 3, // Optional: retry count
  debug: false, // Optional: enable logging
});

// Option 2: Factory function
const client = createClient({
  apiKey: process.env.HOOKBASE_API_KEY!,
});
```

### Applications

Applications represent your customers or tenants.

```typescript
// List applications (cursor-paginated: pass `cursor` back for the next page)
const page = await hookbase.applications.list({ limit: 50 });
const nextPage = page.cursor
  ? await hookbase.applications.list({ limit: 50, cursor: page.cursor })
  : null;

// Get by ID
const app = await hookbase.applications.get('app_123');

// Get by your internal ID (externalId)
const byUid = await hookbase.applications.getByUid('customer_123');

// Create
const created = await hookbase.applications.create({
  name: 'Acme Corp',
  uid: 'customer_123', // Your internal ID, stored as externalId
  metadata: { plan: 'enterprise' },
});

// Get or create (idempotent)
const acme = await hookbase.applications.getOrCreate('customer_123', {
  name: 'Acme Corp',
});

// Update
await hookbase.applications.update('app_123', {
  name: 'Acme Corporation',
});

// Delete
await hookbase.applications.delete('app_123');

// Paginate through all applications
for await (const app of hookbase.applications.listAll()) {
  console.log(app.name);
}
```

### Endpoints

Endpoints are webhook destinations.

```typescript
// List endpoints for an application
const { data } = await hookbase.endpoints.list('app_123');

// Get endpoint
const existing = await hookbase.endpoints.get('app_123', 'ep_456');

// Create endpoint (returns signing secret)
const endpoint = await hookbase.endpoints.create('app_123', {
  url: 'https://example.com/webhooks',
  description: 'Production endpoint',
  // Headers go on the wire as [{ name, value }]; a record is converted for you.
  headers: { 'X-Custom': 'value' },
  timeoutSeconds: 30,
  rateLimitPerSecond: 100,
  successStatusCodes: [200, 201, '2xx'],
  backoffType: 'exponential',
  retryDelays: [5, 30, 300],
  circuitFailureThreshold: 5,
  circuitCooldownSeconds: 120,
});
// whsec_..., shown once. Store it (secretStore stands for your secret manager); don't log it.
await secretStore.set('ep_prod', endpoint.secret!);

// Ed25519 (Standard Webhooks v1a): Hookbase keeps the private key; you get the public key
const ed = await hookbase.endpoints.create('app_123', {
  url: 'https://example.com/webhooks',
  signatureScheme: 'ed25519',
});
console.log('Public key:', ed.publicKey); // whpk_... (also on every GET; not a secret)

// Update
await hookbase.endpoints.update('app_123', 'ep_456', {
  url: 'https://example.com/webhooks/v2',
});

// Enable/Disable
await hookbase.endpoints.disable('app_123', 'ep_456');
await hookbase.endpoints.enable('app_123', 'ep_456');

// Rotate signing secret. The previous key keeps signing until previousSecretExpiresAt
// (gracePeriodSeconds, 0-86400, default 3600).
const rotated = await hookbase.endpoints.rotateSecret('app_123', 'ep_456', { gracePeriodSeconds: 600 });
if (rotated.signatureScheme === 'ed25519') {
  console.log(rotated.publicKey, rotated.previousPublicKey); // whpk_... new and outgoing (public)
} else {
  await secretStore.set('ep_456', rotated.secret); // whsec_..., shown once: store it, don't log it
}

// Get statistics
const stats = await hookbase.endpoints.getStats('app_123', 'ep_456');
console.log(`Success rate: ${stats.successRate}%`);

// Recover circuit breaker
await hookbase.endpoints.recoverCircuit('app_123', 'ep_456');

// Send a test event and see how the endpoint answered
const test = await hookbase.endpoints.test('app_123', 'ep_456', { eventType: 'order.created' });
console.log(test.success, test.delivery.responseStatus);

// Delete
await hookbase.endpoints.delete('app_123', 'ep_456');
```

### Event Types

Event types define the webhook events you can send.

```typescript
// List event types
const { data } = await hookbase.eventTypes.list({ category: 'orders' });

// Get by ID or name
const byId = await hookbase.eventTypes.get('evt_123');
const byName = await hookbase.eventTypes.getByName('order.created');

// Create
const eventType = await hookbase.eventTypes.create({
  name: 'order.created',
  displayName: 'Order Created',
  description: 'Triggered when an order is placed',
  category: 'orders',
  schema: { type: 'object', properties: { orderId: { type: 'string' } } },
});

// Get or create
const orderCreated = await hookbase.eventTypes.getOrCreate('order.created', {
  displayName: 'Order Created',
  category: 'orders',
});

// Archive/Unarchive
await hookbase.eventTypes.archive('evt_123');
await hookbase.eventTypes.unarchive('evt_123');
```

### Subscriptions

Subscriptions link endpoints to event types.

```typescript
// List subscriptions
const { data } = await hookbase.subscriptions.list('app_123', {
  endpointId: 'ep_456',
});

// Create, optionally with filters
const sub = await hookbase.subscriptions.create('app_123', {
  endpointId: 'ep_456',
  eventTypeId: 'evt_789',
  labelFilters: { region: 'eu' }, // match the labels sent with messages.send
  filterExpression: 'amount > 100', // JSONata, evaluated on the payload
});

// Enable/Disable
await hookbase.subscriptions.disable('app_123', 'sub_123');
await hookbase.subscriptions.enable('app_123', 'sub_123');

// Subscribe to multiple event types
await hookbase.subscriptions.subscribeToMany('app_123', 'ep_456', [
  'evt_1',
  'evt_2',
  'evt_3',
]);

// Unsubscribe from all
await hookbase.subscriptions.unsubscribeAll('app_123', 'ep_456');

// Delete
await hookbase.subscriptions.delete('app_123', 'sub_123');
```

### Messages

Send webhooks and manage deliveries.

```typescript
// Send a webhook. A repeated idempotencyKey returns the first send's result instead of
// sending again; without one the SDK generates a key per call, so its own retries are safe.
const result = await hookbase.messages.send('app_123', {
  eventType: 'order.created',
  payload: {
    orderId: 'ord_123',
    amount: 99.99,
  },
  idempotencyKey: 'order_created_ord_123',
  labels: { region: 'eu' }, // subscriptions can filter on these
  priority: 1, // 0=Critical ... 4=Bulk
  metadata: { source: 'checkout' },
});
console.log(`Event ${result.eventId} queued for ${result.messagesQueued} endpoint(s)`);
// Of those, how many were created `held` because their endpoint's circuit is open (absent if none)
if (result.messagesHeld) console.log(`${result.messagesHeld} held until their endpoint recovers`);

// Deliver to specific endpoints only
await hookbase.messages.send('app_123', {
  eventType: 'order.created',
  payload: { orderId: 'ord_123' },
  endpointIds: ['ep_456'],
});

// List outbound messages (one per event per endpoint)
const { data: messages } = await hookbase.messages.list('app_123', {
  eventType: 'order.created',
  status: 'failed',
});

// Get message details
const message = await hookbase.messages.get('app_123', 'msg_456');

// View attempt history
const attempts = await hookbase.messages.listAttempts('app_123', 'msg_456');

// Replay a message (creates a new outbound message)
const replay = await hookbase.messages.retry('app_123', 'msg_456');
console.log(replay.newMessageId);
```

### Portal Tokens

Generate tokens for the embeddable portal.

```typescript
// Create a portal token
const token = await hookbase.portalTokens.create('app_123', {
  expiresInDays: 1, // 1-365, default 30
  scopes: ['read', 'write'],
});

// Use with @hookbase/portal
// <HookbasePortal token={token.token}>...</HookbasePortal>

// Revoke a token
await hookbase.portalTokens.revoke('app_123', 'ptk_456');
```

### Sources (inbound)

`provider` is any string: `KnownSourceProvider` lists the values the API accepts today, and an
unknown one is a 400 from the API. Which secret a provider needs is in the provider catalog.

```typescript
// Find out which secret a provider needs before creating the source
const catalogEntry = await hookbase.providers.get('stripe');
console.log(catalogEntry.signatureVerification?.secretSource); // 'provider': paste the whsec_ secret

const stripe = await hookbase.sources.create({
  name: 'Stripe',
  slug: 'stripe',
  provider: 'stripe',
  signingSecret: 'whsec_...', // vendor-issued: required, format-checked
});

// Providers that verify with no secret (wise, aws-sns) return signingSecret: null
const wise = await hookbase.sources.create({ name: 'Wise', slug: 'wise', provider: 'wise' });
wise.verifiesWithoutSecret; // true

// WhatsApp (Meta) sources also carry a verify token
const wa = await hookbase.sources.create({ name: 'WhatsApp', slug: 'wa', provider: 'whatsapp' });
console.log(wa.verifyToken);
await hookbase.sources.rotateVerifyToken(wa.id);

// Notion parks its verification token until you adopt it
const pending = await hookbase.sources.getPendingVerification('notion');
await hookbase.sources.adoptPendingVerification('notion');

// Rotate a Hookbase-generated secret (400 for vendor-issued, public-key and built-in ones)
await hookbase.sources.rotateSecret('src_123');

// sourceId filters take an id or a slug; an unknown one is a 404, not an empty list
await hookbase.events.list({ sourceId: 'stripe' });

// Record the catalog entry a source is made from (create only). For vendors saved as custom-hmac,
// it stops the vendor's shared IP ranges counting as a verified sender for bridge destinations.
await hookbase.sources.create({
  name: 'Plaid',
  slug: 'plaid',
  provider: 'custom-hmac',
  catalogProvider: 'plaid',
});
```

### Destinations (inbound)

Every `http` destination signs its deliveries with a `whsec_` secret (Standard Webhooks headers), so
the receiver can check they came from Hookbase. `create()` returns the secret once; see
[Verifying deliveries at a destination](#verifying-deliveries-at-a-destination).

```typescript
const destination = await hookbase.destinations.create({
  name: 'Orders service',
  url: 'https://orders.example.com/hookbase',
});
// whsec_..., in this response only: store it where the receiver reads it, don't log it
await secretStore.set('orders-service', destination.signingSecret!);

// Show it again, or rotate it (both need a key with write scope)
const { signingSecret } = await hookbase.destinations.revealSecret(destination.id);
// For gracePeriodSeconds (default 3600) deliveries carry signatures from both secrets.
// Never retried after a timeout or 5xx: check revealSecret() before rotating again.
const rotated = await hookbase.destinations.rotateSecret(destination.id, { gracePeriodSeconds: 600 });
await secretStore.set('orders-service', rotated.signingSecret);
console.log(`The old secret verifies until ${rotated.previousSecretExpiresAt}`);
```

A **bridge** destination publishes each delivery as an outbound event, to the endpoints subscribed to
that event type. By default it publishes only events whose source verified the sender
(`allowUnverifiedSources` overrides that), and creating or changing one also needs the
`events:send` permission. Its test is a dry run: it resolves the event type from a sample payload and
counts the subscribed endpoints, without publishing anything.

```typescript
const bridge = await hookbase.destinations.create({
  name: 'Stripe to customers',
  type: 'bridge',
  config: {
    eventTypeSource: 'field', // or 'fixed', with eventType: 'billing.invoice.paid'
    eventTypeField: 'type', // a dot path into the payload
    eventTypePrefix: 'stripe.', // invoice.paid -> stripe.invoice.paid
  },
});

const check = await hookbase.destinations.test(bridge.id, { payload: { type: 'invoice.paid' } });
if (check.dryRun) {
  console.log(check.eventType, check.eventTypeExists, check.matchingEndpoints);
}
```

The outbound messages a bridge sends point back to where they came from:
`(await hookbase.messages.get(appId, messageId)).bridge` is `{ inboundEventId, deliveryId, hop }`.

### Deliveries (inbound)

```typescript
// Replay a delivery as it was
await hookbase.deliveries.replay('del_123');

// Replay it with changes. payloadPatch is a JSON merge patch on the stored payload (null removes a
// key), and the one to use on a source that masks or encrypts fields; modifiedPayload replaces the
// payload outright. Pass one or the other.
const replay = await hookbase.deliveries.replayWithEdit('del_123', {
  payloadPatch: { data: { amount: 1000 }, debug: null },
  destinationOverride: 'staging-orders', // id or slug
  headersOverride: { 'X-Replayed-By': 'support' },
});
console.log(replay.deliveryId, replay.modified, replay.targetDestinationId);
```

### Holds while a circuit is open

When a route's or an endpoint's circuit breaker opens, its deliveries and messages wait as `held`
instead of spending attempts against a target that is down. They go out once it recovers; one still
held when its retry window ends (`holdExpiresAt`) is dead-lettered. Holding is on by default (for
routes, on plans with the circuit breaker; a route with failover destinations doesn't hold).

Opting out does not bring retries back. With `holdOnCircuitOpen: false`, a delivery or message that
meets an open circuit is dead-lettered at once, with the reason `circuit_breaker_open`.

```typescript
// Opt a route (or an endpoint) out: deliveries that meet its open circuit go straight to the DLQ
await hookbase.routes.update('route_123', { holdOnCircuitOpen: false });

// How many are waiting (counted up to 10,000)
const route = await hookbase.routes.get('route_123');
console.log(route.heldCount, route.heldCountCapped);

const { data: held } = await hookbase.deliveries.list({ status: 'held' });
held.forEach((d) => console.log(d.id, d.holdExpiresAt));
```

## Webhook Verification

Verify incoming webhooks in your application.

```typescript
import express from 'express';
import { createWebhook, HookbaseWebhookVerificationError } from '@hookbase/sdk';

const app = express();
const webhook = createWebhook('whsec_your_signing_secret');

// Express.js example. Verify the raw body: parsing and re-serializing it breaks the signature.
app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    // A Buffer or string body; Node `req.headers`, a plain object or a Fetch `Headers` all work.
    const payload = webhook.verify<{ type: string }>(req.body, req.headers);

    // Process the verified payload
    console.log('Event:', payload.type);

    res.status(200).send('OK');
  } catch (error) {
    if (error instanceof HookbaseWebhookVerificationError) {
      return res.status(401).send('Invalid signature');
    }
    return res.status(500).send('Error');
  }
});
```

### Ed25519 (v1a) endpoints

For an endpoint created with `signatureScheme: 'ed25519'`, pass its public key (`endpoint.publicKey`,
`whpk_...`) instead of a secret. The scheme is picked from the key's prefix, and verification works
the same way: same headers, same timestamp tolerance, and any matching entry in a multi-entry
`webhook-signature` header is accepted (during a key rotation it carries `v1a,<old> v1a,<new>`).

```typescript
import { createWebhook } from '@hookbase/sdk';

const webhook = createWebhook(process.env.HOOKBASE_PUBLIC_KEY!); // whpk_...
webhook.scheme; // 'ed25519'

const payload = webhook.verify(rawBody, headers);
```

A `whsec_` secret verifies only `v1` signatures and a `whpk_` key only `v1a`; a mismatch fails with an
error that names the scheme the endpoint actually uses.

### Verifying deliveries at a destination

Inbound deliveries to an `http` destination are signed the same way, with the destination's `whsec_`
secret (from `destinations.create()` once, or `destinations.revealSecret()`). Verify them with the
same verifier:

```typescript
import { createWebhook } from '@hookbase/sdk';

const webhook = createWebhook(process.env.HOOKBASE_DESTINATION_SECRET!); // the destination's whsec_

app.post('/hookbase', express.raw({ type: '*/*' }), (req, res) => {
  const payload = webhook.verify(req.body, req.headers); // throws if the signature doesn't match
  // webhook-id is the delivery id: the same on every retry of a delivery, so you can dedupe on it
  res.sendStatus(200);
});
```

During a rotation's grace period the `webhook-signature` header carries an entry for each secret, and
either one verifies. `verify()` also parses the body as JSON; when a route's transform sends XML or
text, check the signature with `verifySignature(body, id, timestamp, signature)` instead.

### Testing Webhooks

Generate test headers for local development:

```typescript
import { createWebhook } from '@hookbase/sdk';

const webhook = createWebhook('whsec_dGVzdF9zZWNyZXRfZm9yX2xvY2FsX2Rldg==');

const body = JSON.stringify({ orderId: 'test_123' });
const testHeaders = webhook.generateTestHeaders(body);

// Use these headers to test your webhook handler
```

`webhook.verify(body, headers, { tolerance: 600 })` changes the timestamp tolerance (default 300
seconds). `webhook.verifySignature(body, id, timestamp, signature)` checks only the signature.

With an Ed25519 secret key (`whsk_...`) the test headers are signed `v1a`; a `whpk_` public key
cannot sign, so `generateTestHeaders` throws for one.

## Error Handling

The SDK provides specific error classes:

```typescript
import {
  HookbaseError, // Base error
  HookbaseApiError, // API errors
  HookbaseAuthenticationError, // 401 errors
  HookbaseForbiddenError, // 403 errors
  HookbaseNotFoundError, // 404 errors
  HookbaseValidationError, // 400/422 errors
  HookbaseRateLimitError, // 429 errors
  HookbaseTimeoutError, // Timeout errors
  HookbaseNetworkError, // Network errors
  HookbaseWebhookVerificationError, // Signature verification errors
} from '@hookbase/sdk';

try {
  await hookbase.endpoints.get('app_123', 'invalid_id');
} catch (error) {
  if (error instanceof HookbaseNotFoundError) {
    console.log('Endpoint not found');
  } else if (error instanceof HookbaseRateLimitError) {
    console.log(`Rate limited, retry after ${error.retryAfter}s`);
  } else if (error instanceof HookbaseApiError) {
    console.log(`API error: ${error.message} (${error.code})`);
    console.log(`Request ID: ${error.requestId}`);
  }
}
```

## Retries

- **429** is retried for any method, after `Retry-After` (seconds or an HTTP date; 60s if absent).
  A `Retry-After` over 60s is not waited out: the `HookbaseRateLimitError` is thrown at once with
  `retryAfter` set.
- **5xx, timeouts and network errors** are retried with exponential backoff for GET, PUT, PATCH
  and DELETE. A POST is retried on these only when the API deduplicates it, which is sending an
  event with an idempotency key: `messages.send()` (it always sends one), or `POST /api/send-event`
  or `POST /v1/events` through `request()` with an `idempotencyKey`. Every other POST (rotations,
  replays, tests, creates) ignores the key, so it is not retried on these even when you pass a key
  or `retries`, since the first attempt may have run. A POST whose connection was refused is
  retried.
- **Other 4xx** are never retried. A request cancelled with `signal` is not retried.

## API keys

`hookbase.apiKeys.list()` and `delete()` work with an API key. `create()` requires a dashboard user
session: a client authenticated with a `whr_` key gets `HookbaseForbiddenError`.

## Request Options

Override defaults for specific requests:

```typescript
const result = await hookbase.messages.send(
  'app_123',
  { eventType: 'order.created', payload: {} },
  {
    timeout: 60000, // Custom timeout
    retries: 5, // Custom retry count
    idempotencyKey: 'unique_key', // For safe retries
    signal: abortController.signal, // For cancellation (not retried once aborted)
  }
);
```

## TypeScript

All types are exported:

```typescript
import type {
  Application,
  Endpoint,
  EventType,
  Subscription,
  Message,
  OutboundMessage,
  SendMessageInput,
  HookbaseClientOptions,
} from '@hookbase/sdk';
```

## Upgrading to 4.2

New in 4.2:

- Destination signing secrets: `destinations.create()` returns `signingSecret` once
  (`DestinationWithSecret`), plus `destinations.revealSecret()`, `destinations.rotateSecret()` and
  `Destination.hasSigningSecret`.
- Bridge destinations: `type: 'bridge'` with a `BridgeConfig`, `destinations.test(id, { payload })`
  for the dry run, and `OutboundMessage.bridge` (plus `traceId`, `eventVersion` and
  `deliveredEventVersion`) on `messages.get()`.
- Holds while a circuit is open: the `held` status on deliveries and outbound messages,
  `holdExpiresAt`, `holdOnCircuitOpen` on routes and endpoints, `heldCount`/`heldCountCapped` on
  `routes.get()`/`endpoints.get()`, `messagesHeld` on `messages.send()` and `held` in
  `messages.getStatsSummary()`.
- `deliveries.replayWithEdit()`.
- `Source.catalogProvider`, set on create only.
- `events.debug()` deliveries are typed (`EventDebugDelivery`), including `patternHints` and
  `routeCircuit`.
- `DeliveryStatus` lists `awaiting_retry`, `held`, `failed_over` and `schema_failed`, and no longer
  `circuit_open`, which was never a delivery status. `MessageStatus` lists `awaiting_pull`,
  `fifo_waiting` and `held`.
- `TransformType` adds `typescript`, `jmespath`, `jsonlogic` and `jq`, and `transforms.engines()`
  lists what a deployment can run.

Type changes that may need small edits in strict TypeScript code:

- `Destination.config` is `WarehouseConfig | BridgeConfig | null`. Reading a field the warehouse
  configs share (`destination.config?.prefix`) without narrowing no longer compiles: narrow first
  (`'bucket' in config`) or cast to the config type you expect.
- `DestinationTestResult` is a union of the test-request result and the bridge dry run. Existing
  property reads still compile; check `result.dryRun` to tell them apart.
- New required properties (`Destination.hasSigningSecret`, `Route.holdOnCircuitOpen`,
  `Endpoint.holdOnCircuitOpen`, `Source.catalogProvider`, `Delivery.holdExpiresAt`,
  `OutboundMessage.holdExpiresAt`, `OutboundStatsSummary.held`) need adding where your code builds
  these objects itself, such as test fixtures.

Behaviour changes:

- `messages.send()` returns every field the API sends. It used to drop `messagesHeld` and
  `eventVersion`. The deprecated `outboundMessages[].status` was always `pending`; it is now `held`
  when every message was held, and `unknown` when only some were (the response doesn't say which).
- Sources' `ipAllowlist`, `ipDenylist`, `encryptFields` and `maskFields` now arrive as arrays from
  `sources.get()`, `list()` and `export()`, as the types always said. The API used to send them as
  JSON strings: remove any `JSON.parse()` of these fields.
- `deliveries.list({ status: 'pending' })` also returns `awaiting_retry` and `held` deliveries.
- An `idempotencyKey` no longer makes every POST retry after a 5xx, timeout or dropped connection,
  only one that sends an event (`messages.send()`, or `POST /api/send-event` and `/v1/events`
  through `request()`). Those are the only POSTs the API deduplicates. On any other POST, such as
  `endpoints.rotateSecret()`, `deliveries.replay()` or `dlq.retry()`, the key is still sent but
  ignored, and a retry could run the call twice: a second rotation replaces the secret the first
  returned. 429s and refused connections are still retried.

## Upgrading to 4.1

4.1 corrects several types to what the API actually returns. The runtime values are unchanged,
but strict TypeScript code may need small edits:

- `Application.externalId` and `uid` are `string | null` (null when no external ID was set).
- `Subscription.eventTypeName` and `updatedAt` are optional (create and update responses omit them).
- `Route.expectedResponse` is `unknown` (the API returns parsed JSON, not a string).
- `ApiKey.lastUsedAt`/`createdAt`, `Transform.version` and `Schema.version` are optional.
- `TransformType` no longer includes `'mapping'`, and `ContentFormat` no longer includes `'form'`;
  the API rejected both.
- `schemas.list()` now returns `jsonSchema` as an object, as `schemas.get()` already did. Remove any
  `JSON.parse(schema.jsonSchema)` on list results.

Behaviour changes:

- A `POST` without an `idempotencyKey` is no longer retried on a 5xx, timeout or dropped connection
  when you pass `retries`. Pass an `idempotencyKey` to make it retry-safe (from 4.2, only when
  sending an event).
- A 429 whose `Retry-After` is over 60s throws `HookbaseRateLimitError` at once instead of waiting.

## Examples

See the [examples](./examples) directory for complete examples:

- [Basic Usage](./examples/basic-usage.ts)
- [Sending Webhooks](./examples/send-webhook.ts)
- [Verifying Webhooks](./examples/verify-webhook.ts)
- [Managing Endpoints](./examples/manage-endpoints.ts)

## License

MIT
