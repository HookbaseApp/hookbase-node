/**
 * Example: Verifying incoming webhooks
 *
 * This example shows how to verify webhook signatures
 * in different web frameworks.
 */

import { createWebhook, HookbaseWebhookVerificationError } from '@hookbase/sdk';

// The signing secret from when you created the endpoint
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;

// Create a webhook verifier
const webhook = createWebhook(WEBHOOK_SECRET);

// ============================================
// Example 1: Node.js HTTP server
// ============================================

import http from 'node:http';

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhooks') {
    res.writeHead(404);
    res.end();
    return;
  }

  // Collect the raw body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const rawBody = Buffer.concat(chunks).toString('utf-8');

  try {
    // Verify and parse the webhook
    const payload = webhook.verify<OrderCreatedEvent>(rawBody, {
      'webhook-id': req.headers['webhook-id'] as string,
      'webhook-timestamp': req.headers['webhook-timestamp'] as string,
      'webhook-signature': req.headers['webhook-signature'] as string,
    });

    console.log('Webhook verified!', payload);

    // Process the event
    await handleWebhookEvent(payload);

    res.writeHead(200);
    res.end('OK');
  } catch (error) {
    if (error instanceof HookbaseWebhookVerificationError) {
      console.error('Webhook verification failed:', error.message);
      res.writeHead(401);
      res.end('Invalid signature');
    } else {
      console.error('Error processing webhook:', error);
      res.writeHead(500);
      res.end('Internal error');
    }
  }
});

// ============================================
// Example 2: Express.js
// ============================================

/*
import express from 'express';

const app = express();

// IMPORTANT: Use raw body parser for webhook routes
app.use('/webhooks', express.raw({ type: 'application/json' }));

app.post('/webhooks', (req, res) => {
  try {
    const payload = webhook.verify(
      req.body.toString(),
      req.headers as Record<string, string>
    );

    console.log('Webhook verified!', payload);
    handleWebhookEvent(payload);

    res.status(200).send('OK');
  } catch (error) {
    if (error instanceof HookbaseWebhookVerificationError) {
      res.status(401).send('Invalid signature');
    } else {
      res.status(500).send('Internal error');
    }
  }
});
*/

// ============================================
// Example 3: Next.js API Route (App Router)
// ============================================

/*
// app/api/webhooks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createWebhook, HookbaseWebhookVerificationError } from '@hookbase/sdk';

const webhook = createWebhook(process.env.WEBHOOK_SECRET!);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headers = Object.fromEntries(request.headers);

  try {
    const payload = webhook.verify(body, headers);
    await handleWebhookEvent(payload);
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof HookbaseWebhookVerificationError) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
*/

// ============================================
// Example 4: Hono
// ============================================

/*
import { Hono } from 'hono';
import { createWebhook, HookbaseWebhookVerificationError } from '@hookbase/sdk';

const app = new Hono();
const webhook = createWebhook(process.env.WEBHOOK_SECRET!);

app.post('/webhooks', async (c) => {
  const body = await c.req.text();

  try {
    const payload = webhook.verify(body, {
      'webhook-id': c.req.header('webhook-id') ?? '',
      'webhook-timestamp': c.req.header('webhook-timestamp') ?? '',
      'webhook-signature': c.req.header('webhook-signature') ?? '',
    });

    await handleWebhookEvent(payload);
    return c.json({ received: true });
  } catch (error) {
    if (error instanceof HookbaseWebhookVerificationError) {
      return c.json({ error: 'Invalid signature' }, 401);
    }
    return c.json({ error: 'Internal error' }, 500);
  }
});
*/

// ============================================
// Webhook Event Types
// ============================================

interface OrderCreatedEvent {
  type: 'order.created';
  data: {
    orderId: string;
    amount: number;
    currency: string;
    customer: {
      name: string;
      email: string;
    };
  };
}

interface PaymentCompletedEvent {
  type: 'payment.completed';
  data: {
    paymentId: string;
    orderId: string;
    amount: number;
  };
}

type WebhookEvent = OrderCreatedEvent | PaymentCompletedEvent;

async function handleWebhookEvent(event: WebhookEvent) {
  switch (event.type) {
    case 'order.created':
      console.log('New order:', event.data.orderId);
      break;
    case 'payment.completed':
      console.log('Payment completed:', event.data.paymentId);
      break;
    default:
      console.log('Unknown event type');
  }
}

// ============================================
// Testing webhooks locally
// ============================================

function testWebhookVerification() {
  const testPayload = JSON.stringify({
    type: 'order.created',
    data: {
      orderId: 'test_123',
      amount: 99.99,
    },
  });

  // Generate test headers
  const testHeaders = webhook.generateTestHeaders(testPayload);

  console.log('Test headers:', testHeaders);

  // Verify the test payload
  const verified = webhook.verify(testPayload, testHeaders);
  console.log('Verified payload:', verified);
}

// testWebhookVerification();
