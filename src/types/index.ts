// ============================================
// Common Types
// ============================================

export interface PaginationParams {
  limit?: number;
  /**
   * Opaque cursor from a previous page's `cursor` (the API's `pagination.nextCursor`). Pass it
   * back verbatim to get the next page; never build or parse one.
   */
  cursor?: string;
  /**
   * @deprecated The outbound list endpoints page by cursor and have never read an offset, so
   * every request with one returned page one again. No longer sent; pass `cursor` instead.
   */
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * A `PaginatedResponse` for an endpoint that pages by opaque cursor rather than offset (every
 * outbound list: applications, endpoints, event types, subscriptions, messages and the DLQ).
 * `cursor` is the value to pass back in as the next request's `cursor` param; `null` once
 * `hasMore` is `false`. `total` is the size of this page, not of the whole result set, and
 * `offset` is always 0.
 */
export interface CursorPaginatedResponse<T> extends PaginatedResponse<T> {
  cursor: string | null;
}

export interface ApiResponse<T> {
  data: T;
}

export type SortOrder = 'asc' | 'desc';

// ============================================
// Application Types
// ============================================

export interface Application {
  id: string;
  name: string;
  organizationId: string;
  externalId: string;
  metadata: Record<string, unknown> | null;

  /** Null when unset. `null` and `0` are different answers, so this is not defaulted. */
  rateLimitPerSecond: number | null;
  rateLimitPerMinute: number | null;
  rateLimitPerHour: number | null;

  isDisabled: boolean;
  disabledAt: string | null;
  disabledReason: string | null;

  totalEndpoints: number;
  totalMessagesSent: number;
  totalMessagesFailed: number;
  lastEventAt: string | null;

  createdBy: string | null;
  apiKeyId: string | null;
  createdAt: string;
  updatedAt: string;

  /**
   * @deprecated The API calls this `externalId` and has never sent a key named `uid`, so this
   * property was typed `string` while being `undefined` at runtime. Read `externalId`. The SDK
   * fills this in from `externalId` on every response so existing code keeps working.
   */
  uid: string;

  /** Set on create and get-or-create responses only; absent elsewhere. */
  sendEventUrl?: string;
}

export interface CreateApplicationInput {
  name: string;
  uid?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateApplicationInput {
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface ListApplicationsParams extends PaginationParams {
  search?: string;
}

// ============================================
// Endpoint Types
// ============================================

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface Endpoint {
  id: string;
  applicationId: string;
  url: string;
  description: string | null;

  /** First twelve characters of the signing secret, followed by `...`. */
  secretPrefix: string;
  hasSecret: boolean;
  /** Increments on every rotation. */
  secretVersion: number;

  /**
   * Custom delivery headers.
   *
   * The API sends these as an array of `{name, value}` and `[]` when there are none. The SDK folds
   * that into a record, in the order the array arrived, because this property has always been typed
   * as one — the array is on `headerList` if you need the wire shape.
   */
  headers: Record<string, string> | null;
  /** The headers exactly as the API sends them. */
  headerList: EndpointHeader[];

  /** Per-delivery HTTP timeout in seconds. */
  timeoutSeconds: number;

  isDisabled: boolean;
  disabledAt: string | null;
  disabledReason: string | null;

  /** Delivery rate cap in requests per second. 0 means unlimited. */
  rateLimitPerSecond: number;
  /** Status codes counted as success, or null for the 200-299 default. */
  successStatusCodes: SuccessStatusCode[] | null;
  /** Null means the platform default (exponential). */
  backoffType: BackoffType | null;
  /** Explicit retry delays in seconds, or null for the default schedule. */
  retryDelays: number[] | null;
  /** Informational note recording which IPs this endpoint expects traffic from. */
  ipAllowlistNotes: string | null;
  /** Whether deliveries go through the dedicated static-IP proxy. */
  useStaticIp: boolean;

  circuitState: CircuitState;
  circuitOpenedAt: string | null;
  circuitFailureCount: number;
  circuitFailureThreshold: number;
  circuitSuccessThreshold: number;
  circuitCooldownSeconds: number;

  totalMessages: number;
  totalSuccesses: number;
  totalFailures: number;
  avgResponseTimeMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastResponseStatus: number | null;

  isVerified: boolean;
  verifiedAt: string | null;

  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  apiKeyId: string | null;

  /** Present on list responses only. */
  subscriptionCount?: number;

  /**
   * @deprecated Only `endpoints.create` returns the signing secret, and only once. Every other
   * response masks it, so this property was typed `string` while being `undefined` at runtime
   * everywhere except a create. Read it off the `EndpointWithSecret` a create returns, or read
   * `secretPrefix`.
   */
  secret?: string;
  /** @deprecated The API has no such column and has never returned it; always null. Event-type filtering lives on subscriptions. */
  filterTypes: string[] | null;
  /** @deprecated The API has no such column and has never returned it; always null. Read `rateLimitPerSecond`. */
  rateLimit: number | null;
  /** @deprecated The API has no such column and has never returned it; always null. The endpoint rate limit is per second. */
  rateLimitPeriod: number | null;
  /** @deprecated The API has no such column and has never returned it; always null. Applications carry metadata, endpoints do not. */
  metadata: Record<string, unknown> | null;
}

/** What `endpoints.create` returns: an endpoint plus the one plaintext view of its secret. */
export interface EndpointWithSecret extends Endpoint {
  secret: string;
}

/** Backoff curve used between delivery retries. */
export type BackoffType = 'exponential' | 'linear' | 'fixed';

/**
 * One custom delivery header.
 *
 * The API takes headers as an array of name/value pairs — a `Record<string, string>` body has
 * always been a 400, not a silent drop, so this is the one field here that was failing out loud.
 * A record is still accepted by the inputs below and converted to this shape for you, in
 * insertion order.
 */
export interface EndpointHeader {
  name: string;
  value: string;
}

/** Headers as an endpoint input accepts them: the wire shape, or a record converted to it. */
export type EndpointHeadersInput = EndpointHeader[] | Record<string, string>;

/**
 * A status code that counts as a successful delivery: an exact code (`200`) or a class pattern
 * (`'2xx'`).
 */
export type SuccessStatusCode = number | string;

export interface CreateEndpointInput {
  url: string;
  /** Max 500 characters. */
  description?: string;
  /** Custom headers sent with every delivery, max 10. A record is converted to `[{name, value}]`. */
  headers?: EndpointHeadersInput;
  /** Per-delivery HTTP timeout in seconds, 1-120. The API defaults to 30. */
  timeoutSeconds?: number;
  /** Delivery rate cap in requests per second, 0-1000. 0 means unlimited. */
  rateLimitPerSecond?: number;
  /** Status codes that count as success, max 20. Exact codes, or patterns like `'2xx'`. */
  successStatusCodes?: SuccessStatusCode[];
  backoffType?: BackoffType;
  /** Retry delays in seconds, max 10 entries, each 1-86400. */
  retryDelays?: number[];
  /** Informational note recording which IPs this endpoint expects traffic from, max 1000. */
  ipAllowlistNotes?: string;
  /** Deliver through the dedicated static-IP proxy. */
  useStaticIp?: boolean;
  /** Consecutive failures that open the circuit, 1-100. */
  circuitFailureThreshold?: number;
  /** Consecutive successes that close a half-open circuit, 1-100. */
  circuitSuccessThreshold?: number;
  /** Seconds an open circuit waits before it probes again, 10-3600. */
  circuitCooldownSeconds?: number;

  /** @deprecated Never accepted by the API and no longer sent; subscribe the endpoint to event types instead (`client.subscriptions.create`). */
  filterTypes?: string[];
  /** @deprecated Renamed to `rateLimitPerSecond`; the value is sent under that name, and `rateLimitPerSecond` wins if both are set. */
  rateLimit?: number;
  /** @deprecated Never accepted by the API and no longer sent; the rate limit is always per second. */
  rateLimitPeriod?: number;
  /** @deprecated Never accepted by the API on endpoints and no longer sent; endpoints have no metadata column. */
  metadata?: Record<string, unknown>;
}

export interface UpdateEndpointInput {
  url?: string;
  /** Max 500 characters. Null clears it. */
  description?: string | null;
  isDisabled?: boolean;
  /** Why the endpoint was disabled, max 500 characters. Only read when `isDisabled` is true. */
  disabledReason?: string;
  /** Custom headers sent with every delivery, max 10. A record is converted to `[{name, value}]`. Pass `[]` to clear. */
  headers?: EndpointHeadersInput;
  /** Per-delivery HTTP timeout in seconds, 1-120. */
  timeoutSeconds?: number;
  /** Delivery rate cap in requests per second, 0-1000. 0 means unlimited. */
  rateLimitPerSecond?: number;
  /** Status codes that count as success, max 20. Null resets to the 2xx default. */
  successStatusCodes?: SuccessStatusCode[] | null;
  backoffType?: BackoffType | null;
  /** Retry delays in seconds, max 10 entries, each 1-86400. Null resets to the default schedule. */
  retryDelays?: number[] | null;
  /** Informational note recording which IPs this endpoint expects traffic from, max 1000. */
  ipAllowlistNotes?: string | null;
  /** Deliver through the dedicated static-IP proxy. */
  useStaticIp?: boolean;
  /** Consecutive failures that open the circuit, 1-100. */
  circuitFailureThreshold?: number;
  /** Consecutive successes that close a half-open circuit, 1-100. */
  circuitSuccessThreshold?: number;
  /** Seconds an open circuit waits before it probes again, 10-3600. */
  circuitCooldownSeconds?: number;

  /** @deprecated Never accepted by the API and no longer sent; subscribe the endpoint to event types instead (`client.subscriptions.create`). */
  filterTypes?: string[];
  /** @deprecated Renamed to `rateLimitPerSecond`; the value is sent under that name, and `rateLimitPerSecond` wins if both are set. */
  rateLimit?: number;
  /** @deprecated Never accepted by the API and no longer sent; the rate limit is always per second. */
  rateLimitPeriod?: number;
  /** @deprecated Never accepted by the API on endpoints and no longer sent; endpoints have no metadata column. */
  metadata?: Record<string, unknown>;
}

export interface ListEndpointsParams extends PaginationParams {
  applicationId?: string;
  isDisabled?: boolean;
}

/** What `endpoints.rotateSecret` returns. */
export interface RotateEndpointSecretResult {
  /** The new signing secret (`whsec_...`). Shown once. */
  secret: string;
  /**
   * Until this time deliveries are signed with both the new and the previous secret, so a
   * receiver still holding the old one keeps verifying.
   */
  previousSecretExpiresAt: string;
  /** The endpoint's secret version after the rotation. */
  secretVersion: number;
}

export interface EndpointStats {
  totalMessages: number;
  totalSuccesses: number;
  totalFailures: number;
  successRate: number;
  averageLatency: number;
  recentFailures: number;
}

// ============================================
// Event Type Types
// ============================================

export interface EventType {
  id: string;
  organizationId: string;
  name: string;
  displayName: string | null;
  description: string | null;
  category: string | null;
  schema: Record<string, unknown> | null;
  schemaVersion: number | null;
  examplePayload: unknown;
  documentationUrl: string | null;
  /** 0=Critical, 1=High, 2=Normal, 3=Low, 4=Bulk; null for the platform default. */
  defaultPriority: number | null;
  isEnabled: boolean;
  isDeprecated: boolean;
  deprecatedAt: string | null;
  deprecatedMessage: string | null;
  isPublic: boolean;
  publishedAt: string | null;
  /** Present on list responses only. */
  subscriptionCount?: number;
  /** @deprecated The API has never sent this; `archive()` toggles `isEnabled`. Read `isEnabled`. */
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventTypeInput {
  /** Lowercase, optionally dot-separated (e.g. `order.created`), max 100. */
  name: string;
  displayName?: string;
  description?: string;
  category?: string;
  /** JSON Schema for the payload; sent as the JSON string the API takes. */
  schema?: Record<string, unknown>;
  /** Example payload; sent as the JSON string the API takes. */
  examplePayload?: unknown;
  documentationUrl?: string;
  /** The API defaults to true. */
  isEnabled?: boolean;
  /** 0=Critical, 1=High, 2=Normal, 3=Low, 4=Bulk. */
  defaultPriority?: number;
}

export interface UpdateEventTypeInput {
  displayName?: string;
  description?: string;
  /** Null clears it. */
  category?: string | null;
  /** Null clears it. */
  schema?: Record<string, unknown> | null;
  /** Null clears it. */
  examplePayload?: unknown;
  /** Null clears it. */
  documentationUrl?: string | null;
  isEnabled?: boolean;
  isDeprecated?: boolean;
  /** Max 500. */
  deprecatedMessage?: string;
  isPublic?: boolean;
  /** 0=Critical, 1=High, 2=Normal, 3=Low, 4=Bulk. Null resets to the default. */
  defaultPriority?: number | null;
}

export interface ListEventTypesParams extends PaginationParams {
  category?: string;
  isEnabled?: boolean;
  search?: string;
}

// ============================================
// Subscription Types
// ============================================

export interface Subscription {
  id: string;
  endpointId: string;
  eventTypeId: string;
  eventTypeName: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubscriptionInput {
  endpointId: string;
  eventTypeId: string;
}

export interface UpdateSubscriptionInput {
  isEnabled?: boolean;
}

export interface ListSubscriptionsParams extends PaginationParams {
  endpointId?: string;
  eventTypeId?: string;
  isEnabled?: boolean;
}

// ============================================
// Message Types
// ============================================

/**
 * Outbound message status. Open-ended: the statuses below are the ones the API uses today, and a
 * status added later still type-checks rather than being treated as impossible.
 */
export type MessageStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'failed'
  | 'awaiting_retry'
  | 'exhausted'
  | 'dlq'
  | (string & {});

export interface Message {
  id: string;
  applicationId: string;
  eventType: string;
  eventId: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * One delivery of an event to one endpoint, as `GET /outbound-messages` and
 * `GET /outbound-messages/:id` return it. The fields marked "get only" are on the single-message
 * response and absent from list items.
 */
export interface OutboundMessage {
  id: string;
  /** The outbound event this message delivers (what `send` returned as `eventId`). */
  eventId: string;
  eventType: string;
  applicationId: string;
  applicationName?: string;
  endpointId: string;
  /** Undefined when the endpoint has since been deleted. */
  endpointUrl?: string;
  status: MessageStatus;
  attempts: number;
  maxAttempts: number;
  lastResponseStatus: number | null;
  lastErrorMessage: string | null;
  createdAt: string;
  completedAt: string | null;

  /** Get only. */
  subscriptionId?: string | null;
  /** Get only. */
  eventTypeId?: string | null;
  /** Get only. */
  lastErrorType?: string | null;
  /** Get only. */
  payloadKey?: string;
  /** Get only. */
  payloadSizeBytes?: number | null;
  /** Get only. */
  payloadHash?: string | null;
  /** Get only. */
  metadata?: unknown;
  /** Get only. */
  priority?: number | null;
  /** Get only. */
  endpointDescription?: string | null;
  /** Get only. The stored payload, or null once retention has removed it. */
  payload?: unknown;

  /** @deprecated The API calls this `eventId`; the SDK mirrors it here. Read `eventId`. */
  messageId: string;
  /** @deprecated The API calls this `lastErrorMessage`; the SDK mirrors it here. Read `lastErrorMessage`. */
  lastError: string | null;
  /** @deprecated The API has never sent this; always null. Read the attempts (`listAttempts`). */
  lastAttemptAt: string | null;
  /** @deprecated The API has never sent this; always null. */
  nextAttemptAt: string | null;
  /** @deprecated The API has never sent this; always null. Read `responseBody` on the attempts. */
  lastResponseBody: string | null;
  /** @deprecated The API has never sent this; always null. Read `completedAt`. */
  deliveredAt: string | null;
  /** @deprecated The API has never sent this; always null. */
  updatedAt: string | null;
}

/** One delivery attempt, as `GET /outbound-messages/:id/attempts` returns it. */
export interface MessageAttempt {
  id: string;
  /** The outbound message this attempt belongs to. */
  messageId: string;
  attemptNumber: number;
  status: string;
  responseStatus: number | null;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  responseTimeMs: number | null;
  totalTimeMs: number | null;
  errorType: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  requestUrl: string | null;
  requestHeaders: Record<string, string> | null;
  requestBodySize: number | null;
  triggeredBy: string | null;
  triggeredByUser: string | null;
  createdAt: string;
  completedAt: string | null;

  /** @deprecated The API calls this `messageId`; the SDK mirrors it here. */
  outboundMessageId: string;
  /** @deprecated The API calls this `errorMessage`; the SDK mirrors it here. */
  error: string | null;
  /** @deprecated The API calls this `responseTimeMs`; the SDK mirrors it here. */
  latencyMs: number | null;
  /** @deprecated The API calls this `createdAt`; the SDK mirrors it here. */
  attemptedAt: string;
}

export interface SendMessageInput {
  eventType: string;
  payload: Record<string, unknown>;
  /**
   * Deliver to these endpoints only (max 100) instead of every subscribed endpoint. Sent as
   * `endpointIds`, and also as `endpointId` when there is exactly one.
   */
  endpointIds?: string[];
  /** Deliver to this one endpoint only. Merged with `endpointIds`. */
  endpointId?: string;
  /**
   * Makes the send safe to repeat: the API returns the first send's result for a repeated key
   * instead of sending again. Max 255. Wins over `RequestOptions.idempotencyKey`. When neither is
   * set the SDK generates one per `send` call, so its own retries cannot send twice.
   */
  idempotencyKey?: string;
  /** Flat key/value pairs; values must be strings (max 1000), numbers, booleans or null. Max 50 keys. */
  metadata?: Record<string, unknown>;
  /** @deprecated The API has never accepted this field and stripped it. No longer sent; use `idempotencyKey` to deduplicate. */
  eventId?: string;
}

export interface SendMessageResponse {
  /** The outbound event created (or, for a repeated idempotency key, the original one). */
  eventId: string;
  /** How many outbound messages were queued — one per targeted endpoint. */
  messagesQueued: number;
  /** The endpoints the event was queued for. */
  endpoints: Array<{ id: string; url: string }>;

  /** @deprecated The API calls this `eventId`; the SDK mirrors it here. Read `eventId`. */
  messageId: string;
  /**
   * @deprecated The send response carries endpoints, not outbound messages: each entry's `id`
   * is the ENDPOINT id, not a message id. Read `endpoints`, and list messages by `eventId`'s
   * endpoints for message ids.
   */
  outboundMessages: Array<{
    id: string;
    endpointId: string;
    status: MessageStatus;
  }>;
}

/** What replaying an outbound message (or retrying a DLQ one) returns. */
export interface MessageReplayResult {
  originalMessageId: string;
  /** The id of the NEW outbound message carrying the replay. */
  newMessageId: string;
  /** `queued` today. */
  status: string;
}

export interface ListMessagesParams extends PaginationParams {
  applicationId?: string;
  endpointId?: string;
  status?: MessageStatus;
  eventType?: string;
  /** @deprecated The message list does not filter by date; ignored by the API. `export` does take it. */
  startDate?: string;
  /** @deprecated The message list does not filter by date; ignored by the API. `export` does take it. */
  endDate?: string;
}

export interface ListOutboundMessagesParams extends PaginationParams {
  endpointId?: string;
  /** @deprecated The message list has no event filter; this is ignored by the API. */
  messageId?: string;
  status?: MessageStatus;
  eventType?: string;
  startDate?: string;
  endDate?: string;
}

// ============================================
// Portal Token Types
// ============================================

export interface PortalToken {
  id: string;
  applicationId: string;
  token?: string;
  tokenPrefix?: string;
  name?: string;
  scopes: string[];
  expiresAt: string;
  createdAt: string;
  isExpired?: boolean;
  isRevoked?: boolean;
}

export interface CreatePortalTokenInput {
  /** Optional name for the token */
  name?: string;
  /** Token scopes (default: ['read', 'write']) */
  scopes?: Array<'read' | 'write'>;
  /** Token expiration in days (1-365, default: 30) */
  expiresInDays?: number;
  /** IP whitelist */
  allowedIps?: string[];
}

// ============================================
// Webhook Verification Types
// ============================================

export interface WebhookHeaders {
  'webhook-id': string;
  'webhook-timestamp': string;
  'webhook-signature': string;
}

export interface VerifyOptions {
  /** Tolerance for timestamp validation in seconds (default: 300 = 5 minutes) */
  tolerance?: number;
}

// ============================================
// Source Types (Inbound)
// ============================================

/**
 * Providers the API accepts for a source today.
 *
 * Mirrors `SUPPORTED_SIGNATURE_PROVIDERS` in the API (`api/src/utils/signature-schemes.ts`): 71
 * signature schemes plus the aliases `svix`, `clerk`, `resend`, `render`, `etsy`, `stytch` (all of
 * `standard-webhooks`) and `generic` (of `custom`). Regenerate with
 * `npx tsx scripts/print-source-enums.ts` in the api package.
 */
export type KnownSourceProvider =
  | 'adyen'
  | 'airtable'
  | 'asana'
  | 'auth0'
  | 'aws-sns'
  | 'bigcommerce'
  | 'bitbucket'
  | 'braintree'
  | 'calendly'
  | 'chargebee'
  | 'circleci'
  | 'clerk'
  | 'clickup'
  | 'cloudflare'
  | 'coinbase-commerce'
  | 'custom'
  | 'datadog'
  | 'discord'
  | 'docusign'
  | 'etsy'
  | 'freshdesk'
  | 'generic'
  | 'github'
  | 'gitlab'
  | 'gitlab-signing-token'
  | 'gocardless'
  | 'grafana'
  | 'grafana-hmac'
  | 'grafana-hmac-timestamped'
  | 'heroku'
  | 'hubspot'
  | 'intercom'
  | 'jira'
  | 'klaviyo'
  | 'launchdarkly'
  | 'lemonsqueezy'
  | 'linear'
  | 'mailchimp'
  | 'mailgun'
  | 'mollie'
  | 'netlify'
  | 'newrelic'
  | 'notion'
  | 'okta'
  | 'paddle'
  | 'pagerduty'
  | 'paypal'
  | 'pipedrive'
  | 'postmark'
  | 'railway'
  | 'razorpay'
  | 'render'
  | 'resend'
  | 'segment'
  | 'sendgrid'
  | 'sentry'
  | 'shopify'
  | 'slack'
  | 'square'
  | 'standard-webhooks'
  | 'stripe'
  | 'stytch'
  | 'supabase'
  | 'supabase-auth-hooks'
  | 'svix'
  | 'telegram'
  | 'terraform-cloud'
  | 'trello'
  | 'twilio'
  | 'typeform'
  | 'vercel'
  | 'whatsapp'
  | 'wise'
  | 'wise-sandbox'
  | 'woocommerce'
  | 'workos'
  | 'zendesk'
  | 'zoom';

/**
 * A source's provider: any of {@link KnownSourceProvider}, which editors still autocomplete, or
 * any other string. The API adds providers faster than this package ships, so a closed union
 * would make a source with a newer provider a type error in code that only reads it. The API
 * validates the value on create and update and answers an unknown one with a 400.
 */
export type SourceProvider = KnownSourceProvider | (string & {});

/**
 * Corrected in 2026-09: `header` and `event_id` were never accepted, and the
 * three values the API actually defaults to and documents were missing. `auto` is the default.
 */
export type DedupStrategy = 'auto' | 'provider_id' | 'payload_hash' | 'idempotency_key' | 'none';
export type IpFilterMode = 'none' | 'allowlist' | 'denylist' | 'both';

/**
 * A source as the API returns it.
 *
 * The signing secret is never included: GET and PATCH responses carry `hasSigningSecret` and the
 * last four characters instead. The full value is returned exactly twice — by `create()`, which
 * resolves to a {@link SourceWithSecret}, and by `revealSecret()`.
 *
 * `hasSigningSecret: false` is not always a problem; check the two flags beside it.
 * `verifiesWithoutSecret` means the provider signs with a key Hookbase already holds (Wise, AWS
 * SNS), so events are verified with nothing set. `awaitingSigningSecret` means the vendor issues
 * the secret only after the URL is registered with it (Asana, Notion) and it has not been set yet.
 */
export interface Source {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  provider: SourceProvider | null;
  description: string | null;
  /** Whether a signing secret is set. The secret itself is not returned here. */
  hasSigningSecret: boolean;
  /** Last four characters of the signing secret, prefixed with `...`, or null if none is set. */
  signingSecretLast4: string | null;
  /** The provider verifies with a key Hookbase already holds (`wise`, `wise-sandbox`, `aws-sns`):
   *  there is no secret to set, and `hasSigningSecret` stays false on a fully verified source. */
  verifiesWithoutSecret: boolean;
  /** The vendor issues the secret only once this URL is registered with it (`asana`, `notion`) and
   *  it has not been set yet; events are unverified until it is. For Notion, see
   *  `sources.getPendingVerification()`. */
  awaitingSigningSecret: boolean;
  /** Reject events whose signature fails verification. Defaults to false: a failing event is
   *  flagged with `signatureValid: false` and delivered anyway. */
  rejectInvalidSignatures: boolean;
  rateLimitPerMinute: number | null;
  isActive: boolean;
  customDomainId: string | null;
  ipFilterMode: IpFilterMode;
  ipAllowlist: string[];
  ipDenylist: string[];
  encryptFields: string[];
  maskFields: string[];
  dedupEnabled: boolean;
  dedupStrategy: DedupStrategy;
  dedupWindowHours: number;
  dedupCustomHeader: string | null;
  /** Transient mode - payloads never stored at rest (HIPAA/GDPR compliance) */
  transientMode: boolean;
  /** HTTP verbs the ingest endpoint accepts. Empty array means any method. */
  allowedMethods: IngestMethod[];
  eventCount: number;
  routeCount: number;
  /** Returned by `get()` and `create()`. Not included in `list()` responses. */
  ingestUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * HTTP verbs an ingest endpoint can be restricted to.
 */
export type IngestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/** What `create()` returns: a source plus the one look at its signing secret you get. */
export interface SourceWithSecret extends Source {
  /** The signing secret in full, this once. `null` when there is none to show: the provider
   *  verifies without one (`verifiesWithoutSecret`), the vendor issues it after registration
   *  (`awaitingSigningSecret`), or the provider does not sign. */
  signingSecret: string | null;
  /** Meta providers (`whatsapp`) only: the verify token to paste into Meta's webhook setup, in
   *  full, this once. `sources.verifyToken()` reveals it later. */
  verifyToken?: string;
  ingestUrl: string;
}

/**
 * A verification token a vendor (Notion) delivered to the ingest URL during registration. The
 * request carrying it was unauthenticated, so it is held: paste `token` into the vendor's verify
 * form, and once the vendor accepts it call `sources.adoptPendingVerification()`.
 */
export interface PendingVerification {
  provider: string;
  token: string;
  receivedAt: string;
  clientIp: string | null;
}

export interface CreateSourceInput {
  name: string;
  /** Required: it forms the ingest URL, `/ingest/<org>/<slug>`, and cannot be changed later. */
  slug: string;
  provider?: SourceProvider;
  description?: string;
  /**
   * What to supply depends on the provider (the catalog's `signatureVerification.secretSource`;
   * see `providers.get()`):
   * - `provider`: the vendor issues it. Required for several (`standard-webhooks` and its
   *   aliases, `airtable`, `gitlab-signing-token`, `supabase-auth-hooks`, `jira`, `discord`,
   *   `sendgrid`); a missing or malformed one is a 400.
   * - `operator`: omit it and the API generates one, returned once on the created source.
   * - `public_key`: the vendor's public key (PEM or base64).
   * - `built_in` (`wise`, `wise-sandbox`, `aws-sns`): send nothing; any secret is a 400.
   */
  signingSecret?: string;
  /** Meta providers (`whatsapp`) only; a 400 for any other. Omit it and the API generates one. */
  verifyToken?: string;
  /** Reject events whose signature fails verification. Defaults to false. */
  rejectInvalidSignatures?: boolean;
  rateLimitPerMinute?: number | null;
  ipFilterMode?: IpFilterMode;
  ipAllowlist?: string[];
  ipDenylist?: string[];
  /** JSONPath expressions whose values are encrypted at rest. */
  encryptFields?: string[];
  /** JSONPath expressions whose values are masked in stored payloads. */
  maskFields?: string[];
  dedupEnabled?: boolean;
  dedupStrategy?: DedupStrategy;
  /** Deduplication window in hours, 1 to 168. */
  dedupWindowHours?: number;
  /** Header to deduplicate on when dedupStrategy is 'idempotency_key'. */
  dedupCustomHeader?: string;
  /** Enable transient mode - payloads never stored at rest (HIPAA/GDPR compliance) */
  transientMode?: boolean;
  /** Restrict the ingest endpoint to these HTTP verbs. Omit or [] to accept any method. */
  allowedMethods?: IngestMethod[] | null;
}

export interface UpdateSourceInput {
  name?: string;
  description?: string | null;
  provider?: SourceProvider | null;
  isActive?: boolean;
  /** `null` removes the secret. */
  signingSecret?: string | null;
  /** Meta providers (`whatsapp`) only. `''` or `null` generates a fresh one. */
  verifyToken?: string | null;
  rejectInvalidSignatures?: boolean;
  rateLimitPerMinute?: number | null;
  ipFilterMode?: IpFilterMode;
  ipAllowlist?: string[] | null;
  ipDenylist?: string[] | null;
  encryptFields?: string[] | null;
  maskFields?: string[] | null;
  dedupEnabled?: boolean;
  dedupStrategy?: DedupStrategy | null;
  dedupWindowHours?: number | null;
  dedupCustomHeader?: string | null;
  /** Enable transient mode - payloads never stored at rest (HIPAA/GDPR compliance) */
  transientMode?: boolean;
  /** Restrict the ingest endpoint to these HTTP verbs. Pass [] to accept any method again. */
  allowedMethods?: IngestMethod[] | null;
}

// ============================================
// Provider Catalog (public, no auth)
// ============================================

/**
 * Who produces a provider's credential. `provider`: the vendor issues it, paste it as
 * `signingSecret`. `operator`: Hookbase generates it when omitted, paste it into the vendor.
 * `public_key`: paste the vendor's public key. `built_in`: nothing to enter, events are still
 * verified. `none`: the vendor does not sign. Open-ended, like {@link SourceProvider}.
 */
export type ProviderSecretSource =
  | 'provider' | 'operator' | 'public_key' | 'built_in' | 'none' | (string & {});

/** The verification scheme's kind. Open-ended for the same reason. */
export type ProviderSignatureKind =
  | 'hmac' | 'shared_secret' | 'bespoke' | 'asymmetric' | (string & {});

/** The secret fields a create flow needs, as catalog list items carry them. */
export interface ProviderSignatureVerificationSummary {
  supported: boolean;
  /** Absent for catalog entries with no scheme (those that fall back to `custom`). */
  kind?: ProviderSignatureKind;
  secretSource: ProviderSecretSource;
  secretLabel: string;
  secretPlaceholder?: string;
  /** The vendor issues the secret only after the source's URL is registered with it. */
  secretAfterRegistration?: boolean;
}

/** The full block from `providers.get()`. */
export interface ProviderSignatureVerification extends ProviderSignatureVerificationSummary {
  algorithm: string;
  headerName: string;
  secretLocationHint: string;
  /** One sentence on where the value comes from or goes, in the vendor's own UI wording. */
  secretInstruction: string;
  /** A required shape: `whsec_`-prefixed base64, or a generated HTTP Basic auth pair. */
  secretFormat?: 'whsec' | 'basic_auth' | (string & {});
  /** Present for Meta providers, which also use a verify token. */
  verifyToken?: { label: string; instruction: string };
}

export interface ProviderEventType {
  type: string;
  description: string;
}

/**
 * A provider as the catalog list returns it. `id` is the catalog's id; `hookbaseProvider` is the
 * value to use as a source's `provider`. They differ for some entries (catalog `mollie-nextgen`
 * is provider `mollie`, and several entries map to `custom`).
 */
export interface CatalogProvider {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  eventTypeCount: number;
  hookbaseProvider: SourceProvider;
  hasSignatureVerification: boolean;
  hasIpRanges: boolean;
  /** `null` when the provider has none. Absent from API versions that predate the summary on
   *  list items; fall back to `providers.get(id)` then. */
  signatureVerification?: ProviderSignatureVerificationSummary | null;
}

export interface ProviderCatalogList {
  providers: CatalogProvider[];
  categories: string[];
  total: number;
}

/** One provider in full, from `providers.get()`. */
export interface CatalogProviderDetail {
  id: string;
  name: string;
  category: string;
  description: string;
  website: string;
  docsUrl: string;
  icon: string;
  hookbaseProvider: SourceProvider;
  signatureVerification: ProviderSignatureVerification | null;
  eventTypes: ProviderEventType[];
  /** Example payloads keyed by event type. */
  samplePayloads: Record<string, unknown>;
  ipRanges: string[] | null;
  setupGuide: string[];
}

export interface ProviderEvents {
  providerId: string;
  providerName: string;
  eventTypes: ProviderEventType[];
  samplePayloads: Record<string, unknown>;
}

export interface ListCatalogProvidersParams {
  category?: string;
  /** Matched against name, description and category. */
  search?: string;
}

export interface ListSourcesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  provider?: SourceProvider;
  isActive?: boolean;
}

// ============================================
// Destination Types (Inbound)
// ============================================

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type AuthType = 'none' | 'basic' | 'bearer' | 'api_key' | 'custom_header';
export type DestinationType = 'http' | 's3' | 'r2' | 'gcs' | 'azure_blob';

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
  fileFormat?: 'json' | 'jsonl';
  partitionBy?: 'date' | 'hour' | 'source';
}

export interface R2Config {
  bucket: string;
  prefix?: string;
  fileFormat?: 'json' | 'jsonl';
  partitionBy?: 'date' | 'hour' | 'source';
}

export interface GCSConfig {
  bucket: string;
  projectId: string;
  serviceAccountKey: string;
  prefix?: string;
  fileFormat?: 'json' | 'jsonl';
  partitionBy?: 'date' | 'hour' | 'source';
}

export interface AzureBlobConfig {
  accountName: string;
  accountKey: string;
  containerName: string;
  prefix?: string;
  fileFormat?: 'json' | 'jsonl';
  partitionBy?: 'date' | 'hour' | 'source';
}

export type WarehouseConfig = S3Config | R2Config | GCSConfig | AzureBlobConfig;

export interface FieldMapping {
  source: string;
  target: string;
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'json';
  default?: string;
}

export interface Destination {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  /**
   * @deprecated Always null. `destinations` has no description column, so the API never returns
   * one -- see the same field on CreateDestinationInput. Reading it renders an empty value, not
   * the destination's description.
   */
  description: string | null;
  type: DestinationType;
  url: string;
  method: HttpMethod;
  headers: Record<string, string> | null;
  authType: AuthType;
  authConfig: Record<string, unknown> | null;
  /** Request timeout in milliseconds. This is the field the API returns. */
  timeoutMs: number;
  /**
   * @deprecated Always undefined at runtime despite this type. The API returns `timeoutMs`; this
   * name was never in a response. Use {@link Destination.timeoutMs}.
   */
  timeout: number;
  /** @deprecated Always undefined at runtime. There is no retry-count column; the API never sends it. */
  retryCount: number;
  /** @deprecated Always undefined at runtime. There is no retry-interval column; the API never sends it. */
  retryInterval: number;
  throttle: {
    mode: 'off' | 'rate' | 'concurrency';
    rateLimit: number | null;
    rateUnit: 'second' | 'minute' | 'hour' | null;
    maxConcurrency: number | null;
    queueLimit: number | null;
  } | null;
  isActive: boolean;
  useStaticIp: boolean;
  config: WarehouseConfig | null;
  fieldMapping: FieldMapping[] | null;
  batchSize?: number;
  batchWindowSeconds?: number;
  deliveryCount: number;
  /** Routes pointing at this destination. */
  routeCount?: number;
  successCount?: number;
  failureCount?: number;
  /**
   * @deprecated Always undefined at runtime. There is no last_delivery_at column anywhere in the
   * schema and no response includes this key, so anything rendering it shows a permanent blank.
   */
  lastDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDestinationInput {
  name: string;
  /**
   * URL-safe identifier, `^[a-z0-9-]+$`, max 50 characters.
   *
   * Required by the API. Omit it and one is derived from `name` rather than letting the request
   * 400 — pass it explicitly whenever the slug matters, since it is part of how the destination
   * is addressed and cannot be changed afterwards.
   */
  slug?: string;
  type?: DestinationType;
  /** Required for `type: 'http'`; warehouse and queue destinations leave it unset. */
  url?: string;
  method?: HttpMethod;
  /** Sent as a record — this is the shape the destinations API takes, unlike endpoint headers. */
  headers?: Record<string, string>;
  authType?: AuthType;
  authConfig?: Record<string, unknown>;
  /** Request timeout in milliseconds, 1000-60000. The API defaults to 30000. */
  timeoutMs?: number;
  throttle?: {
    mode: 'off' | 'rate' | 'concurrency';
    rateLimit?: number;
    rateUnit?: 'second' | 'minute' | 'hour';
    maxConcurrency?: number;
    queueLimit?: number;
  };
  config?: WarehouseConfig;
  fieldMapping?: FieldMapping[];
  useStaticIp?: boolean;
  batchSize?: number;
  batchWindowSeconds?: number;

  /** @deprecated Never accepted by the API and no longer sent; destinations have no description column. */
  description?: string;
  /**
   * @deprecated Renamed to `timeoutMs`; the value is sent under that name, and `timeoutMs` wins
   * if both are set. Milliseconds, 1000-60000, as everywhere else in this SDK — the value was
   * never reaching the API before, so a call that passed seconds here landed on the 30000
   * default and now 400s instead. Multiply by 1000.
   */
  timeout?: number;
  /** @deprecated Never accepted by the API and no longer sent; retries are configured per route, not per destination. */
  retryCount?: number;
  /** @deprecated Never accepted by the API and no longer sent; retries are configured per route, not per destination. */
  retryInterval?: number;
}

export interface UpdateDestinationInput {
  name?: string;
  url?: string;
  method?: HttpMethod;
  /** Sent as a record — this is the shape the destinations API takes, unlike endpoint headers. */
  headers?: Record<string, string>;
  authType?: AuthType;
  authConfig?: Record<string, unknown>;
  /** Request timeout in milliseconds, 1000-60000. */
  timeoutMs?: number;
  throttle?: {
    mode: 'off' | 'rate' | 'concurrency';
    rateLimit?: number;
    rateUnit?: 'second' | 'minute' | 'hour';
    maxConcurrency?: number;
    queueLimit?: number;
  };
  isActive?: boolean;
  config?: WarehouseConfig;
  fieldMapping?: FieldMapping[];
  useStaticIp?: boolean;
  batchSize?: number;
  batchWindowSeconds?: number;

  /** @deprecated Never accepted by the API and no longer sent; destinations have no description column. */
  description?: string;
  /**
   * @deprecated Renamed to `timeoutMs`; the value is sent under that name, and `timeoutMs` wins
   * if both are set. Milliseconds, 1000-60000, as everywhere else in this SDK — the value was
   * never reaching the API before, so a call that passed seconds here landed on the 30000
   * default and now 400s instead. Multiply by 1000.
   */
  timeout?: number;
  /** @deprecated Never accepted by the API and no longer sent; retries are configured per route, not per destination. */
  retryCount?: number;
  /** @deprecated Never accepted by the API and no longer sent; retries are configured per route, not per destination. */
  retryInterval?: number;
}

export interface ListDestinationsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
}

// ============================================
// Route Types (Inbound)
// ============================================

/**
 * `POST /destinations/:id/test`. A failed test (network error, missing warehouse config) is still
 * a 200, with `success: false` and `error` set and no `status`.
 */
export interface DestinationTestResult {
  success: boolean;
  /** HTTP status the destination answered with. */
  status?: number;
  latencyMs?: number;
  /** First 1000 characters of the response body. */
  responseBody?: string;
  error?: string;

  /** @deprecated The API calls this `status`; the SDK mirrors it here. */
  statusCode?: number;
  /** @deprecated The API calls this `latencyMs`; the SDK mirrors it here. */
  duration?: number;
}

export type CircuitStatus = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  circuitCooldownSeconds?: number;
  circuitFailureThreshold?: number;
  circuitProbeSuccessThreshold?: number;
}

export interface Route {
  id: string;
  organizationId: string;
  name: string;
  sourceId: string;
  destinationId: string;
  filterId: string | null;
  filterConditions: FilterCondition[] | null;
  filterLogic: string | null;
  transformId: string | null;
  schemaId: string | null;
  priority: number;
  isActive: boolean;
  circuitState: CircuitStatus | null;
  circuitOpenedAt: string | null;
  circuitCooldownSeconds: number | null;
  circuitFailureThreshold: number | null;
  circuitProbeSuccessThreshold: number | null;
  notifyOnFailure: boolean;
  notifyOnSuccess: boolean;
  notifyOnRecovery: boolean;
  notifyEmails: string | null;
  failureThreshold: number | null;
  failoverDestinationIds: string[] | null;
  failoverAfterAttempts: number | null;
  expectedResponse: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRouteInput {
  name: string;
  sourceId: string;
  destinationId: string;
  filterId?: string;
  filterConditions?: FilterCondition[];
  filterLogic?: string;
  transformId?: string;
  schemaId?: string;
  priority?: number;
  isActive?: boolean;
  notifyOnFailure?: boolean;
  notifyOnSuccess?: boolean;
  notifyOnRecovery?: boolean;
  notifyEmails?: string;
  failureThreshold?: number;
  failoverDestinationIds?: string[];
  failoverAfterAttempts?: number;
  expectedResponse?: string;
}

export interface UpdateRouteInput {
  name?: string;
  sourceId?: string;
  destinationId?: string;
  filterId?: string | null;
  filterConditions?: FilterCondition[] | null;
  filterLogic?: string | null;
  transformId?: string | null;
  schemaId?: string | null;
  priority?: number;
  isActive?: boolean;
  notifyOnFailure?: boolean;
  notifyOnSuccess?: boolean;
  notifyOnRecovery?: boolean;
  notifyEmails?: string | null;
  failureThreshold?: number | null;
  failoverDestinationIds?: string[] | null;
  failoverAfterAttempts?: number | null;
  expectedResponse?: string | null;
}

export interface ListRoutesParams {
  page?: number;
  pageSize?: number;
  sourceId?: string;
  destinationId?: string;
  isActive?: boolean;
}

/** `GET /routes/:id/circuit-status`. The thresholds are the route's, or the API's defaults. */
export interface CircuitStatusInfo {
  circuitState: CircuitStatus;
  circuitOpenedAt: string | null;
  cooldownSeconds: number;
  /** Half-open probes sent so far. */
  probeAttempts: number;
  probeSuccessThreshold: number;
  failureThreshold: number;
  consecutiveFailures: number;
  /** Seconds until an open circuit lets a probe through; null unless the circuit is open. */
  timeUntilProbeSeconds: number | null;

  /** @deprecated The API calls this `cooldownSeconds`; the SDK mirrors it here. */
  circuitCooldownSeconds: number;
  /** @deprecated The API calls this `failureThreshold`; the SDK mirrors it here. */
  circuitFailureThreshold: number;
  /** @deprecated The API calls this `probeSuccessThreshold`; the SDK mirrors it here. */
  circuitProbeSuccessThreshold: number;
  /** @deprecated The API calls this `consecutiveFailures`; the SDK mirrors it here. */
  recentFailures: number;
}

/** `POST /routes/:id/reset-circuit`. */
export interface CircuitResetResult {
  success: boolean;
  circuitState: CircuitStatus;
  previousState: CircuitStatus | null;
}

// ============================================
// Inbound Event Types
// ============================================

export type InboundEventStatus =
  | 'delivered'
  | 'failed'
  | 'pending'
  | 'partial'
  | 'duplicate'
  | 'no_routes';

export interface DeliveryStats {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
}

export interface InboundEvent {
  id: string;
  sourceId: string;
  organizationId: string;
  eventType: string | null;
  payloadHash: string | null;
  payloadKey: string;
  /** The request headers as stored: a JSON object serialised to a string. */
  headers: string | null;
  signatureValid: boolean | null;
  receivedAt: string;
  ipAddress: string | null;
  sourceName: string;
  sourceSlug: string;
  status: InboundEventStatus;
  /** The HTTP verb the webhook arrived with. */
  method: string;
  deliveryStats: DeliveryStats | null;
}

/**
 * `GET /events/:id`. The API sends the event, its payload and its deliveries as three siblings;
 * the SDK flattens them into one object.
 */
export interface EventDetail {
  id: string;
  organizationId: string;
  sourceId: string;
  eventType: string | null;
  payloadHash: string | null;
  payloadKey: string;
  /** The request headers as stored: a JSON object serialised to a string. */
  headers: string | null;
  signatureValid: boolean | null;
  receivedAt: string;
  ipAddress: string | null;
  sourceName: string;
  encryptFields: unknown;
  maskFields: unknown;
  status: InboundEventStatus;
  /** The HTTP verb the webhook arrived with. */
  method: string;
  /**
   * The payload, decrypted and with the source's mask fields applied. Null when it was never
   * stored (a transient source) or retention has removed it.
   */
  payload: unknown;
  /** True when the source does not store payloads. */
  transient: boolean;
  deliveries: Delivery[];
}

export interface EventDebugInfo {
  event: {
    id: string;
    sourceId: string;
    eventType: string | null;
    headers: Record<string, string>;
    payload: unknown;
    signatureValid: number | null;
    receivedAt: string;
    ipAddress: string | null;
  };
  curlCommand: string;
}

export interface ListEventsParams {
  limit?: number;
  /**
   * Opaque cursor from a previous page's `cursor` (the API's `nextCursor`). Pass it back
   * verbatim to get the next page; never build or parse one.
   */
  cursor?: string;
  /**
   * @deprecated The events list pages by cursor and has never read an offset, so every request
   * with one returned page one again. No longer sent; pass `cursor` instead.
   */
  offset?: number;
  /**
   * Ask for an exact `total`. The count is expensive on a large org, so the API skips it unless
   * asked, and always skips it when `status` is set; without it `total` is the size of the page.
   */
  includeTotal?: boolean;
  /** A source id or slug. One that matches no source is a 404, not an empty list. */
  sourceId?: string;
  eventType?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  signatureValid?: '0' | '1';
  status?: InboundEventStatus;
}

export interface ExportEventsParams {
  format?: 'json' | 'csv';
  /** A source id or slug. One that matches no source is a 404. */
  sourceId?: string;
  eventType?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  signatureValid?: '0' | '1';
  status?: InboundEventStatus;
}

// ============================================
// Delivery Types (Inbound)
// ============================================

/**
 * `success` and `retrying` were never values the API sends — a delivered delivery is
 * `delivered`, and one waiting on a retry is `pending` with an `attemptCount` above zero.
 */
export type DeliveryStatus =
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'throttled'
  | 'circuit_open'
  | (string & {});

export interface Delivery {
  id: string;
  organizationId: string;
  eventId: string;
  routeId: string;
  destinationId: string;
  status: DeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  /** HTTP status the destination answered with; null before the first attempt or on a network error. */
  responseStatus: number | null;
  /** R2 key of the stored response, when one was kept. */
  responseKey: string | null;
  /** The destination's response headers as stored: a JSON object serialised to a string. */
  responseHeaders: string | null;
  responseBody: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  destinationName: string;
  /** Sent by `deliveries.get` and on the deliveries of `events.get`; not on `deliveries.list`. */
  destinationUrl?: string;
  /** Sent by `deliveries.list` only. */
  eventType?: string | null;

  /** @deprecated The API calls this `responseStatus`; the SDK mirrors it here. */
  statusCode: number | null;
  /** @deprecated The API calls this `attemptCount`; the SDK mirrors it here. */
  attempts: number;
  /** @deprecated The API calls this `errorMessage`; the SDK mirrors it here. */
  error: string | null;
  /** @deprecated The API calls this `latencyMs`; the SDK mirrors it here. */
  duration: number | null;
  /** @deprecated The API calls this `deliveredAt`; the SDK mirrors it here. */
  completedAt: string | null;
}

export interface DeliveryDetail extends Delivery {
  /** @deprecated The API has never sent a nested event; read `eventId`. Always undefined. */
  event?: {
    id: string;
    eventType: string | null;
    receivedAt: string;
  };
  /**
   * @deprecated The API sends `destinationName` and `destinationUrl` flat; the SDK mirrors them
   * here. Read those.
   */
  destination?: {
    name: string;
    url: string;
  };
}

export interface ListDeliveriesParams {
  limit?: number;
  offset?: number;
  eventId?: string;
  routeId?: string;
  destinationId?: string;
  status?: DeliveryStatus;
}

export interface ReplayResult {
  deliveryId: string;
  message: string;
}

export interface BulkReplayResult {
  message: string;
  queued: number;
  skipped: number;
  results: Array<{ deliveryId: string; status: string }>;
}

// ============================================
// Transform Types (Inbound)
// ============================================

export type TransformType = 'jsonata' | 'javascript' | 'mapping';
export type ContentFormat = 'json' | 'xml' | 'form' | 'text';

export interface Transform {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  transformType: TransformType;
  code: string;
  inputFormat: ContentFormat;
  outputFormat: ContentFormat;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransformInput {
  name: string;
  slug?: string;
  description?: string;
  transformType: TransformType;
  code: string;
  inputFormat?: ContentFormat;
  outputFormat?: ContentFormat;
}

export interface UpdateTransformInput {
  name?: string;
  description?: string;
  transformType?: TransformType;
  code?: string;
  inputFormat?: ContentFormat;
  outputFormat?: ContentFormat;
}

export interface ListTransformsParams {
  page?: number;
  pageSize?: number;
}

export interface TransformTestInput {
  transformType: TransformType;
  code: string;
  inputFormat?: ContentFormat;
  outputFormat?: ContentFormat;
  payload: unknown;
}

/**
 * `POST /transforms/test`. A transform that fails to run is still a 200, with `success: false`
 * and `error` set.
 */
export interface TransformTestResult {
  success: boolean;
  /** The transform's output: parsed when `contentType` is JSON, the raw text otherwise. */
  result?: unknown;
  /** Content type of the output, e.g. `application/json`. */
  contentType?: string;
  error?: string;

  /** @deprecated The API calls this `result`; the SDK mirrors it here. */
  output?: unknown;
  /** @deprecated The API has never sent a timing; always undefined. */
  executionTimeMs?: number;
}

// ============================================
// Filter Types (Inbound)
// ============================================

export interface FilterCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface Filter {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  conditions: FilterCondition[];
  logic: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFilterInput {
  name: string;
  slug?: string;
  description?: string;
  conditions: FilterCondition[];
  logic?: string;
}

export interface UpdateFilterInput {
  name?: string;
  description?: string;
  conditions?: FilterCondition[];
  logic?: string;
}

export interface ListFiltersParams {
  page?: number;
  pageSize?: number;
}

export interface FilterTestInput {
  conditions: FilterCondition[];
  logic?: string;
  payload: unknown;
}

export interface FilterTestResult {
  matches: boolean;
  results: Array<{ passed: boolean }>;
  logic: string;
}

// ============================================
// Schema Types (Inbound)
// ============================================

export interface Schema {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  jsonSchema: string;
  version: number;
  routes?: Array<{ id: string; name: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSchemaInput {
  name: string;
  slug?: string;
  description?: string;
  jsonSchema: Record<string, unknown>;
}

export interface UpdateSchemaInput {
  name?: string;
  description?: string;
  jsonSchema?: Record<string, unknown>;
}

export interface ListSchemasParams {
  page?: number;
  pageSize?: number;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================
// DLQ Types (Outbound)
// ============================================

export interface DlqMessage {
  id: string;
  /** The outbound event this message delivers. */
  eventId: string;
  eventType: string;
  applicationId: string;
  applicationName?: string;
  endpointId: string;
  /** Undefined when the endpoint has since been deleted. */
  endpointUrl?: string;
  status: MessageStatus;
  attempts: number;
  maxAttempts: number;
  lastResponseStatus: number | null;
  lastErrorType: string | null;
  lastErrorMessage: string | null;
  dlqReason: string | null;
  dlqMovedAt: string | null;
  dlqRetryCount: number | null;
  dlqLastRetryAt: string | null;
  createdAt: string;
  completedAt: string | null;

  /** @deprecated The API calls this `eventId`; the SDK mirrors it here. Read `eventId`. */
  messageId: string;
  /** @deprecated The API calls this `lastErrorMessage`; the SDK mirrors it here. Read `lastErrorMessage`. */
  lastError: string | null;
  /** @deprecated The API has never sent this; always null. */
  lastAttemptAt: string | null;
  /** @deprecated The API has never sent this; always null. */
  updatedAt: string | null;
}

export interface DlqEndpointCount {
  endpointId: string;
  /** Undefined when the endpoint has since been deleted. */
  endpointUrl?: string;
  count: number;
}

export interface DlqStats {
  total: number;
  /** Count per DLQ reason; a message with no reason is counted under `unknown`. */
  byReason: Record<string, number>;
  /** The ten endpoints with the most DLQ messages, most first. */
  byEndpoint: DlqEndpointCount[];
  /** The ten event types with the most DLQ messages, most first. */
  byEventType: Array<{ eventType: string; count: number }>;
  /** @deprecated The API calls this `byEndpoint`; the SDK mirrors it here. Read `byEndpoint`. */
  topFailingEndpoints: DlqEndpointCount[];
}

export interface ListDlqParams {
  limit?: number;
  /** Opaque cursor from the previous page's `cursor`; pass it back verbatim. */
  cursor?: string;
  endpointId?: string;
  applicationId?: string;
  /** Sent as the API's `reason` query param. */
  reason?: string;
  eventType?: string;
  /** ISO timestamp; DLQ messages moved there at or after this. */
  startDate?: string;
  /** ISO timestamp; DLQ messages moved there at or before this. */
  endDate?: string;
  /** @deprecated The API reads this filter as `reason` and ignored `dlqReason`. Sent as `reason`; `reason` wins if both are set. */
  dlqReason?: string;
}

export type DlqRetryResult = MessageReplayResult;

export interface DlqBulkRetryResult {
  /** How many messages were queued for retry. */
  queued: number;
  /** How many of the ids asked for were not in the DLQ (or not found) and were skipped. */
  skipped: number;
  /** One entry per queued message. */
  messages: Array<{ originalMessageId: string; newMessageId: string }>;

  /** @deprecated The API calls this `queued + skipped`; the SDK fills it in. */
  total: number;
  /** @deprecated The API calls this `queued`; the SDK mirrors it here. */
  retried: number;
  /** @deprecated The API calls this `skipped`; the SDK mirrors it here. */
  failed: number;
  /** @deprecated The API calls this `messages`; the SDK fills it in from them (queued entries only). */
  results: Array<{
    messageId: string;
    status: string;
    newMessageId?: string;
    error?: string;
  }>;
}

export interface DlqBulkDeleteResult {
  /** How many ids were submitted for deletion. */
  deleted: number;
  /** @deprecated The API does not send this; the SDK mirrors `deleted` here. */
  total: number;
}

// ============================================
// Outbound Stats Types
// ============================================

export interface OutboundStatsSummary {
  pending: number;
  processing: number;
  success: number;
  failed: number;
  /** Retries handed to the cron sweep between attempts. */
  awaitingRetry: number;
  exhausted: number;
  dlq: number;
  total: number;
}

export interface ExportOutboundParams {
  /** The API defaults to json. With csv, `export` resolves to the CSV text. */
  format?: 'json' | 'csv';
  type?: 'events' | 'messages';
  startDate?: string;
  endDate?: string;
  status?: string;
  eventType?: string;
  applicationId?: string;
  limit?: number;
}

export interface OutboundEventExportRow {
  id: string;
  eventType: string;
  applicationId: string | null;
  labels: string | null;
  status: string | null;
  endpointsTargeted: number | null;
  endpointsFiltered: number | null;
  payloadSizeBytes: number | null;
  idempotencyKey: string | null;
  sourceIp: string | null;
  createdAt: string;
}

export interface OutboundMessageExportRow {
  id: string;
  eventId: string;
  eventType: string;
  applicationId: string;
  endpointId: string;
  endpointUrl?: string;
  status: MessageStatus;
  attempts: number;
  maxAttempts: number;
  lastResponseStatus: number | null;
  lastErrorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** A JSON export. `events` is set for `type: 'events'` (the default), `messages` for `type: 'messages'`. */
export interface OutboundExport {
  exportedAt: string;
  /** The organization's slug. */
  organization: string;
  count: number;
  events?: OutboundEventExportRow[];
  messages?: OutboundMessageExportRow[];
}

// ============================================
// Import/Export Types
// ============================================

export type ConflictStrategy = 'skip' | 'rename' | 'overwrite';

export interface ImportParams {
  conflictStrategy?: ConflictStrategy;
  validateOnly?: boolean;
}

/** One item that failed to import. */
export interface ImportFailure {
  name: string;
  error: string;
}

/** Per-item verdict from the validation pass that runs before every import. */
export interface ImportValidationResult {
  index: number;
  name: string;
  /** Sources and destinations only; routes are matched by name. */
  slug?: string;
  status: 'valid' | 'error' | 'skip' | 'rename' | 'overwrite';
  errors: string[];
  warnings: string[];
  /** The slug a `rename` will use (sources, destinations). */
  resolvedSlug?: string;
  /** The name a `rename` will use (routes). */
  resolvedName?: string;
}

/**
 * Counts. Which keys are present depends on the resource and on `validateOnly`:
 *
 *  - sources/destinations import: `imported`, `skipped`, `overwritten`, `failed`
 *  - sources/destinations validate: `total`, `toCreate`, `toOverwrite`, `toSkip`, `errors`
 *  - routes import: `total`, `imported`, `skipped`, `errors`
 *  - routes validate: `total`, `valid`, `skipped`, `overwrite`, `errors`
 */
export interface ImportSummary {
  total?: number;
  imported?: number;
  skipped?: number;
  overwritten?: number;
  failed?: number;
  errors?: number;
  toCreate?: number;
  toOverwrite?: number;
  toSkip?: number;
  valid?: number;
  overwrite?: number;
}

/** Sources/destinations import only: which items landed where, by name or slug. */
export interface ImportDetails {
  imported: string[];
  skipped: string[];
  overwritten: string[];
  failed: ImportFailure[];
}

/**
 * Result of `sources.import`, `destinations.import` and `routes.import`. The three endpoints do
 * not answer in quite the same shape, so most fields are optional; see each one.
 */
export interface ImportResult {
  /** Absent on a sources/destinations `validateOnly` run, which sends `valid` instead. */
  success?: boolean;
  /** Sources/destinations `validateOnly`: true when no item failed validation. */
  valid?: boolean;
  /** Routes `validateOnly` only. */
  validateOnly?: boolean;
  summary: ImportSummary;
  /** Sources/destinations import (not validate). */
  details?: ImportDetails;
  /** Any `validateOnly` run. */
  validationResults?: ImportValidationResult[];
  /** Routes import (not validate): names of the routes created or overwritten. */
  imported?: string[];
  /** Routes import (not validate): names of the routes skipped. */
  skipped?: string[];
  /** Routes import (not validate). */
  errors?: ImportFailure[];
}

// ============================================
// Client Configuration Types
// ============================================

export interface HookbaseClientOptions {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for the API (default: https://api.hookbase.app) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Number of retry attempts for failed requests (default: 3) */
  retries?: number;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
  /** Debug mode - logs requests and responses */
  debug?: boolean;
}

export interface RequestOptions {
  /** Override timeout for this request */
  timeout?: number;
  /** Override retries for this request */
  retries?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Idempotency key for safe retries */
  idempotencyKey?: string;
}
