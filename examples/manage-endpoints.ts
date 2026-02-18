/**
 * Example: Managing endpoints and subscriptions
 *
 * This example shows how to manage webhook endpoints
 * and their subscriptions programmatically.
 */

import { Hookbase, HookbaseNotFoundError } from '@hookbase/sdk';

const hookbase = new Hookbase({
  apiKey: process.env.HOOKBASE_API_KEY!,
});

// ============================================
// Managing Endpoints
// ============================================

async function createEndpoint(appId: string) {
  const endpoint = await hookbase.endpoints.create(appId, {
    url: 'https://api.example.com/webhooks',
    description: 'Production webhook endpoint',
    // Optional: Custom headers sent with each webhook
    headers: {
      'X-Custom-Header': 'value',
    },
    // Optional: Rate limiting
    rateLimit: 100, // requests per period
    rateLimitPeriod: 60, // seconds
    // Optional: Filter to specific event types
    filterTypes: ['order.*', 'payment.completed'],
    // Optional: Your metadata
    metadata: {
      environment: 'production',
      region: 'us-east-1',
    },
  });

  console.log('Created endpoint:', endpoint.id);
  console.log('Secret:', endpoint.secret);
  console.log('⚠️  Save the secret - it cannot be retrieved later!');

  return endpoint;
}

async function updateEndpoint(appId: string, endpointId: string) {
  const endpoint = await hookbase.endpoints.update(appId, endpointId, {
    url: 'https://api.example.com/webhooks/v2',
    description: 'Updated webhook endpoint',
  });

  console.log('Updated endpoint:', endpoint.url);
  return endpoint;
}

async function rotateSecret(appId: string, endpointId: string) {
  const { secret } = await hookbase.endpoints.rotateSecret(appId, endpointId);

  console.log('New secret:', secret);
  console.log('⚠️  Update your webhook handler with the new secret!');

  return secret;
}

async function disableEndpoint(appId: string, endpointId: string) {
  await hookbase.endpoints.disable(appId, endpointId);
  console.log('Endpoint disabled');
}

async function enableEndpoint(appId: string, endpointId: string) {
  await hookbase.endpoints.enable(appId, endpointId);
  console.log('Endpoint enabled');
}

async function getEndpointStats(appId: string, endpointId: string) {
  const stats = await hookbase.endpoints.getStats(appId, endpointId);

  console.log('Endpoint Statistics:');
  console.log(`  Total messages: ${stats.totalMessages}`);
  console.log(`  Successes: ${stats.totalSuccesses}`);
  console.log(`  Failures: ${stats.totalFailures}`);
  console.log(`  Success rate: ${stats.successRate}%`);
  console.log(`  Average latency: ${stats.averageLatency}ms`);
  console.log(`  Recent failures: ${stats.recentFailures}`);

  return stats;
}

async function recoverCircuitBreaker(appId: string, endpointId: string) {
  const endpoint = await hookbase.endpoints.recoverCircuit(appId, endpointId);
  console.log(`Circuit recovered, state: ${endpoint.circuitState}`);
  return endpoint;
}

// ============================================
// Managing Subscriptions
// ============================================

async function subscribeToEvents(appId: string, endpointId: string) {
  // Get all available event types
  const { data: eventTypes } = await hookbase.eventTypes.list();

  // Subscribe to specific event types
  const orderEvents = eventTypes.filter((et) => et.name.startsWith('order.'));

  const subscriptions = await hookbase.subscriptions.subscribeToMany(
    appId,
    endpointId,
    orderEvents.map((et) => et.id)
  );

  console.log(`Subscribed to ${subscriptions.length} event types`);
  return subscriptions;
}

async function listSubscriptions(appId: string, endpointId: string) {
  const { data: subscriptions } = await hookbase.subscriptions.list(appId, {
    endpointId,
  });

  console.log(`Endpoint subscriptions (${subscriptions.length}):`);
  for (const sub of subscriptions) {
    console.log(`  - ${sub.eventTypeName} (${sub.isEnabled ? 'enabled' : 'disabled'})`);
  }

  return subscriptions;
}

async function unsubscribeFromAll(appId: string, endpointId: string) {
  await hookbase.subscriptions.unsubscribeAll(appId, endpointId);
  console.log('Unsubscribed from all event types');
}

// ============================================
// Managing Event Types
// ============================================

async function createEventTypes() {
  const eventTypes = [
    {
      name: 'order.created',
      displayName: 'Order Created',
      description: 'Triggered when a new order is placed',
      category: 'orders',
    },
    {
      name: 'order.updated',
      displayName: 'Order Updated',
      description: 'Triggered when an order is modified',
      category: 'orders',
    },
    {
      name: 'order.cancelled',
      displayName: 'Order Cancelled',
      description: 'Triggered when an order is cancelled',
      category: 'orders',
    },
    {
      name: 'payment.completed',
      displayName: 'Payment Completed',
      description: 'Triggered when a payment is successful',
      category: 'payments',
    },
    {
      name: 'payment.failed',
      displayName: 'Payment Failed',
      description: 'Triggered when a payment fails',
      category: 'payments',
    },
  ];

  for (const et of eventTypes) {
    await hookbase.eventTypes.getOrCreate(et.name, et);
    console.log(`Created event type: ${et.name}`);
  }
}

// ============================================
// Pagination Examples
// ============================================

async function listAllEndpoints(appId: string) {
  // Option 1: Manual pagination
  let offset = 0;
  const limit = 50;
  let hasMore = true;

  while (hasMore) {
    const response = await hookbase.endpoints.list(appId, { limit, offset });
    for (const endpoint of response.data) {
      console.log(`Endpoint: ${endpoint.url}`);
    }
    hasMore = response.hasMore;
    offset += limit;
  }

  // Option 2: Async iterator (recommended)
  console.log('\nUsing async iterator:');
  for await (const endpoint of hookbase.endpoints.listAll(appId)) {
    console.log(`Endpoint: ${endpoint.url}`);
  }
}

// ============================================
// Error Handling
// ============================================

async function safeGetEndpoint(appId: string, endpointId: string) {
  try {
    const endpoint = await hookbase.endpoints.get(appId, endpointId);
    return endpoint;
  } catch (error) {
    if (error instanceof HookbaseNotFoundError) {
      console.log('Endpoint not found');
      return null;
    }
    throw error;
  }
}

// ============================================
// Portal Integration
// ============================================

async function generatePortalAccess(appId: string) {
  // Create a short-lived token for the embedded portal
  const token = await hookbase.portalTokens.create(appId, {
    expiresIn: 3600, // 1 hour
  });

  console.log('Portal token:', token.token);
  console.log('Expires at:', token.expiresAt);

  // Return this to your frontend to use with @hookbase/portal
  return token.token;
}

// Run examples
async function main() {
  const appId = 'app_test';

  // await createEventTypes();
  // const endpoint = await createEndpoint(appId);
  // await subscribeToEvents(appId, endpoint.id);
  // await listSubscriptions(appId, endpoint.id);
  // await getEndpointStats(appId, endpoint.id);
}

main().catch(console.error);
