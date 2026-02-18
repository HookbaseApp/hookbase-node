/**
 * Example: Sending webhooks with the Hookbase SDK
 *
 * This example shows different ways to send webhooks.
 */

import { Hookbase } from '@hookbase/sdk';

const hookbase = new Hookbase({
  apiKey: process.env.HOOKBASE_API_KEY!,
});

// Example 1: Basic webhook send
async function sendBasicWebhook() {
  const result = await hookbase.messages.send('app_123', {
    eventType: 'order.created',
    payload: {
      orderId: 'ord_123',
      amount: 99.99,
    },
  });

  console.log(`Message ID: ${result.messageId}`);
  console.log(`Sent to ${result.outboundMessages.length} endpoints`);
}

// Example 2: Send with idempotency key (safe for retries)
async function sendWithIdempotency() {
  const eventId = `order_created_${Date.now()}`;

  const result = await hookbase.messages.send(
    'app_123',
    {
      eventType: 'order.created',
      eventId, // Your internal event ID for deduplication
      payload: {
        orderId: 'ord_456',
      },
    },
    {
      idempotencyKey: eventId, // Prevents duplicate sends
    }
  );

  return result;
}

// Example 3: Send to specific endpoints only
async function sendToSpecificEndpoints() {
  const result = await hookbase.messages.send('app_123', {
    eventType: 'order.created',
    payload: {
      orderId: 'ord_789',
    },
    endpointIds: ['ep_abc', 'ep_def'], // Only send to these endpoints
  });

  return result;
}

// Example 4: Send with metadata (for your tracking)
async function sendWithMetadata() {
  const result = await hookbase.messages.send('app_123', {
    eventType: 'payment.completed',
    payload: {
      paymentId: 'pay_123',
      amount: 50.0,
    },
    metadata: {
      source: 'checkout-service',
      version: '2.0',
      correlationId: 'req_xyz',
    },
  });

  return result;
}

// Example 5: Check delivery status
async function checkDeliveryStatus(appId: string, messageId: string) {
  const { data: outbounds } = await hookbase.messages.listOutbound(
    appId,
    messageId
  );

  for (const outbound of outbounds) {
    console.log(`Endpoint: ${outbound.endpointUrl}`);
    console.log(`Status: ${outbound.status}`);
    console.log(`Attempts: ${outbound.attempts}`);

    if (outbound.status === 'failed' || outbound.status === 'exhausted') {
      console.log(`Last error: ${outbound.lastError}`);

      // View all attempts
      const attempts = await hookbase.messages.listAttempts(appId, outbound.id);
      for (const attempt of attempts) {
        console.log(
          `  Attempt ${attempt.attemptNumber}: ${attempt.responseStatus} (${attempt.latencyMs}ms)`
        );
      }
    }
  }
}

// Example 6: Retry a failed message
async function retryFailed(appId: string, outboundMessageId: string) {
  const outbound = await hookbase.messages.retry(appId, outboundMessageId);
  console.log(`Retried message, new status: ${outbound.status}`);
}

// Example 7: Resend to all endpoints
async function resendMessage(appId: string, messageId: string) {
  const result = await hookbase.messages.resend(appId, messageId);
  console.log(`Resent message, ${result.outboundMessages.length} new deliveries`);
}

// Run examples
async function main() {
  await sendBasicWebhook();
}

main().catch(console.error);
