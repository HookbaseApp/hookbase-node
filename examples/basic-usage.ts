/**
 * Basic usage example for the Hookbase SDK
 *
 * This example shows how to:
 * - Initialize the client
 * - Create an application
 * - Create an endpoint
 * - Subscribe to event types
 * - Send a webhook
 */

import { Hookbase } from '@hookbase/sdk';

async function main() {
  // Initialize the client
  const hookbase = new Hookbase({
    apiKey: process.env.HOOKBASE_API_KEY!,
    // baseUrl: 'https://api.hookbase.app', // Optional: custom API URL
    // debug: true, // Optional: enable debug logging
  });

  // Create or get an application for your customer
  const app = await hookbase.applications.getOrCreate('customer_123', {
    name: 'Acme Corp',
    metadata: { plan: 'enterprise' },
  });
  console.log(`Application: ${app.name} (${app.id})`);

  // Create an event type
  const eventType = await hookbase.eventTypes.getOrCreate('order.created', {
    displayName: 'Order Created',
    description: 'Triggered when a new order is placed',
    category: 'orders',
  });
  console.log(`Event type: ${eventType.name}`);

  // Create an endpoint for the customer
  const endpoint = await hookbase.endpoints.create(app.id, {
    url: 'https://example.com/webhooks',
    description: 'Production webhook endpoint',
  });
  console.log(`Endpoint created: ${endpoint.url}`);
  console.log(`Signing secret: ${endpoint.secret}`);
  console.log('⚠️  Save the secret securely - it cannot be retrieved later!');

  // Subscribe the endpoint to event types
  await hookbase.subscriptions.create(app.id, {
    endpointId: endpoint.id,
    eventTypeId: eventType.id,
  });
  console.log(`Subscribed to: ${eventType.name}`);

  // Send a webhook
  const result = await hookbase.messages.send(app.id, {
    eventType: 'order.created',
    payload: {
      orderId: 'ord_123',
      amount: 99.99,
      currency: 'USD',
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
      },
    },
  });
  console.log(`Message sent: ${result.messageId}`);
  console.log(`Deliveries: ${result.outboundMessages.length}`);
}

main().catch(console.error);
