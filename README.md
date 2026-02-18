# @hookbase/sdk

Official Node.js SDK for [Hookbase](https://hookbase.app) - the webhook management platform.

## Installation

```bash
npm install @hookbase/sdk
```

## Quick Start

```typescript
import { Hookbase } from '@hookbase/sdk';

const hookbase = new Hookbase({
  apiKey: 'your_api_key',
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
- **Automatic Retries**: Built-in retry logic with exponential backoff
- **Pagination Helpers**: Async iterators for large datasets
- **Error Handling**: Specific error classes for different failure modes

## API Reference

### Client Initialization

```typescript
import { Hookbase, createClient } from '@hookbase/sdk';

// Option 1: Constructor
const hookbase = new Hookbase({
  apiKey: process.env.HOOKBASE_API_KEY,
  baseUrl: 'https://api.hookbase.app', // Optional
  timeout: 30000, // Optional: 30 seconds
  retries: 3, // Optional: retry count
  debug: false, // Optional: enable logging
});

// Option 2: Factory function
const hookbase = createClient({
  apiKey: process.env.HOOKBASE_API_KEY,
});
```

### Applications

Applications represent your customers or tenants.

```typescript
// List applications
const { data, total } = await hookbase.applications.list({ limit: 50 });

// Get by ID
const app = await hookbase.applications.get('app_123');

// Get by your internal UID
const app = await hookbase.applications.getByUid('customer_123');

// Create
const app = await hookbase.applications.create({
  name: 'Acme Corp',
  uid: 'customer_123', // Your internal ID
  metadata: { plan: 'enterprise' },
});

// Get or create (idempotent)
const app = await hookbase.applications.getOrCreate('customer_123', {
  name: 'Acme Corp',
});

// Update
const app = await hookbase.applications.update('app_123', {
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
const endpoint = await hookbase.endpoints.get('app_123', 'ep_456');

// Create endpoint (returns signing secret)
const endpoint = await hookbase.endpoints.create('app_123', {
  url: 'https://example.com/webhooks',
  description: 'Production endpoint',
  headers: { 'X-Custom': 'value' },
  rateLimit: 100,
  rateLimitPeriod: 60,
});
console.log('Secret:', endpoint.secret); // Save this!

// Update
const endpoint = await hookbase.endpoints.update('app_123', 'ep_456', {
  url: 'https://example.com/webhooks/v2',
});

// Enable/Disable
await hookbase.endpoints.disable('app_123', 'ep_456');
await hookbase.endpoints.enable('app_123', 'ep_456');

// Rotate signing secret
const { secret } = await hookbase.endpoints.rotateSecret('app_123', 'ep_456');

// Get statistics
const stats = await hookbase.endpoints.getStats('app_123', 'ep_456');
console.log(`Success rate: ${stats.successRate}%`);

// Recover circuit breaker
await hookbase.endpoints.recoverCircuit('app_123', 'ep_456');

// Delete
await hookbase.endpoints.delete('app_123', 'ep_456');
```

### Event Types

Event types define the webhook events you can send.

```typescript
// List event types
const { data } = await hookbase.eventTypes.list({ category: 'orders' });

// Get by ID or name
const eventType = await hookbase.eventTypes.get('evt_123');
const eventType = await hookbase.eventTypes.getByName('order.created');

// Create
const eventType = await hookbase.eventTypes.create({
  name: 'order.created',
  displayName: 'Order Created',
  description: 'Triggered when an order is placed',
  category: 'orders',
  schema: { type: 'object', properties: { orderId: { type: 'string' } } },
});

// Get or create
const eventType = await hookbase.eventTypes.getOrCreate('order.created', {
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

// Create
const sub = await hookbase.subscriptions.create('app_123', {
  endpointId: 'ep_456',
  eventTypeId: 'evt_789',
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
// Send a webhook
const result = await hookbase.messages.send('app_123', {
  eventType: 'order.created',
  payload: {
    orderId: 'ord_123',
    amount: 99.99,
  },
  eventId: 'unique_event_id', // For deduplication
  metadata: { source: 'checkout' },
});
console.log(`Message ID: ${result.messageId}`);

// Send with idempotency key (safe for retries)
const result = await hookbase.messages.send(
  'app_123',
  { eventType: 'order.created', payload: { orderId: 'ord_123' } },
  { idempotencyKey: 'order_created_ord_123' }
);

// List messages
const { data } = await hookbase.messages.list('app_123', {
  eventType: 'order.created',
  startDate: '2024-01-01',
});

// Get message details
const message = await hookbase.messages.get('app_123', 'msg_456');

// List delivery attempts
const { data } = await hookbase.messages.listOutbound('app_123', 'msg_456');

// Get outbound message details
const outbound = await hookbase.messages.getOutbound('app_123', 'out_789');

// View attempt history
const attempts = await hookbase.messages.listAttempts('app_123', 'out_789');

// Retry a failed delivery
await hookbase.messages.retry('app_123', 'out_789');

// Resend to all endpoints
await hookbase.messages.resend('app_123', 'msg_456');
```

### Portal Tokens

Generate tokens for the embeddable portal.

```typescript
// Create a portal token
const token = await hookbase.portalTokens.create('app_123', {
  expiresIn: 3600, // 1 hour
});

// Use with @hookbase/portal
// <HookbasePortal token={token.token}>...</HookbasePortal>

// Revoke a token
await hookbase.portalTokens.revoke('app_123', 'ptk_456');
```

## Webhook Verification

Verify incoming webhooks in your application.

```typescript
import { createWebhook, HookbaseWebhookVerificationError } from '@hookbase/sdk';

const webhook = createWebhook('whsec_your_signing_secret');

// Express.js example
app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const payload = webhook.verify(req.body.toString(), req.headers);

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

### Testing Webhooks

Generate test headers for local development:

```typescript
const webhook = createWebhook('whsec_test_secret');

const payload = JSON.stringify({ orderId: 'test_123' });
const headers = webhook.generateTestHeaders(payload);

// Use these headers to test your webhook handler
```

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
    signal: abortController.signal, // For cancellation
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

## Examples

See the [examples](./examples) directory for complete examples:

- [Basic Usage](./examples/basic-usage.ts)
- [Sending Webhooks](./examples/send-webhook.ts)
- [Verifying Webhooks](./examples/verify-webhook.ts)
- [Managing Endpoints](./examples/manage-endpoints.ts)

## License

MIT
