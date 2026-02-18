// ============================================
// Common Types
// ============================================

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
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
  uid: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
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
  secret: string;
  isDisabled: boolean;
  circuitState: CircuitState;
  circuitOpenedAt: string | null;
  filterTypes: string[] | null;
  rateLimit: number | null;
  rateLimitPeriod: number | null;
  headers: Record<string, string> | null;
  metadata: Record<string, unknown> | null;
  totalMessages: number;
  totalSuccesses: number;
  totalFailures: number;
  createdAt: string;
  updatedAt: string;
}

export interface EndpointWithSecret extends Endpoint {
  secret: string;
}

export interface CreateEndpointInput {
  url: string;
  description?: string;
  filterTypes?: string[];
  rateLimit?: number;
  rateLimitPeriod?: number;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface UpdateEndpointInput {
  url?: string;
  description?: string;
  isDisabled?: boolean;
  filterTypes?: string[];
  rateLimit?: number;
  rateLimitPeriod?: number;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface ListEndpointsParams extends PaginationParams {
  applicationId?: string;
  isDisabled?: boolean;
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
  isEnabled: boolean;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventTypeInput {
  name: string;
  displayName?: string;
  description?: string;
  category?: string;
  schema?: Record<string, unknown>;
}

export interface UpdateEventTypeInput {
  displayName?: string;
  description?: string;
  category?: string;
  schema?: Record<string, unknown>;
  isEnabled?: boolean;
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

export type MessageStatus = 'pending' | 'success' | 'failed' | 'exhausted';

export interface Message {
  id: string;
  applicationId: string;
  eventType: string;
  eventId: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface OutboundMessage {
  id: string;
  messageId: string;
  endpointId: string;
  endpointUrl: string;
  eventType: string;
  status: MessageStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  lastResponseStatus: number | null;
  lastResponseBody: string | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageAttempt {
  id: string;
  outboundMessageId: string;
  attemptNumber: number;
  responseStatus: number | null;
  responseBody: string | null;
  responseHeaders: Record<string, string> | null;
  error: string | null;
  latencyMs: number | null;
  attemptedAt: string;
}

export interface SendMessageInput {
  eventType: string;
  payload: Record<string, unknown>;
  eventId?: string;
  metadata?: Record<string, unknown>;
  /** Specific endpoint IDs to send to (optional, defaults to all subscribed) */
  endpointIds?: string[];
}

export interface SendMessageResponse {
  messageId: string;
  outboundMessages: Array<{
    id: string;
    endpointId: string;
    status: MessageStatus;
  }>;
}

export interface ListMessagesParams extends PaginationParams {
  applicationId?: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
}

export interface ListOutboundMessagesParams extends PaginationParams {
  endpointId?: string;
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

export type SourceProvider =
  | 'generic'
  | 'github'
  | 'stripe'
  | 'shopify'
  | 'slack'
  | 'twilio'
  | 'sendgrid'
  | 'mailgun'
  | 'paddle'
  | 'linear'
  | 'svix'
  | 'custom';

export type DedupStrategy = 'none' | 'header' | 'payload_hash' | 'event_id';
export type IpFilterMode = 'none' | 'allowlist' | 'denylist';

export interface Source {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  provider: SourceProvider;
  isActive: boolean;
  signingSecret: string | null;
  ingestUrl: string | null;
  verifySignature: boolean;
  dedupStrategy: DedupStrategy;
  dedupWindow: number | null;
  dedupHeaderName: string | null;
  ipFilterMode: IpFilterMode;
  ipAllowlist: string[] | null;
  ipDenylist: string[] | null;
  rateLimit: number | null;
  rateLimitWindow: number | null;
  /** Transient mode - payloads never stored at rest (HIPAA/GDPR compliance) */
  transientMode: boolean;
  eventCount: number;
  lastEventAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceWithSecret extends Source {
  signingSecret: string;
}

export interface CreateSourceInput {
  name: string;
  slug?: string;
  description?: string;
  provider?: SourceProvider;
  verifySignature?: boolean;
  dedupStrategy?: DedupStrategy;
  dedupWindow?: number;
  dedupHeaderName?: string;
  ipFilterMode?: IpFilterMode;
  ipAllowlist?: string[];
  ipDenylist?: string[];
  rateLimit?: number;
  rateLimitWindow?: number;
  /** Enable transient mode - payloads never stored at rest (HIPAA/GDPR compliance) */
  transientMode?: boolean;
}

export interface UpdateSourceInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  verifySignature?: boolean;
  dedupStrategy?: DedupStrategy;
  dedupWindow?: number;
  dedupHeaderName?: string;
  ipFilterMode?: IpFilterMode;
  ipAllowlist?: string[];
  ipDenylist?: string[];
  rateLimit?: number;
  rateLimitWindow?: number;
  /** Enable transient mode - payloads never stored at rest (HIPAA/GDPR compliance) */
  transientMode?: boolean;
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

export interface Destination {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  url: string;
  method: HttpMethod;
  headers: Record<string, string> | null;
  authType: AuthType;
  authConfig: Record<string, unknown> | null;
  timeout: number;
  retryCount: number;
  retryInterval: number;
  rateLimit: number | null;
  rateLimitWindow: number | null;
  isActive: boolean;
  deliveryCount: number;
  lastDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDestinationInput {
  name: string;
  slug?: string;
  description?: string;
  url: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  authType?: AuthType;
  authConfig?: Record<string, unknown>;
  timeout?: number;
  retryCount?: number;
  retryInterval?: number;
  rateLimit?: number;
  rateLimitWindow?: number;
}

export interface UpdateDestinationInput {
  name?: string;
  description?: string;
  url?: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  authType?: AuthType;
  authConfig?: Record<string, unknown>;
  timeout?: number;
  retryCount?: number;
  retryInterval?: number;
  rateLimit?: number;
  rateLimitWindow?: number;
  isActive?: boolean;
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

export interface CircuitStatusInfo {
  circuitState: CircuitStatus;
  circuitOpenedAt: string | null;
  circuitCooldownSeconds: number;
  circuitFailureThreshold: number;
  circuitProbeSuccessThreshold: number;
  recentFailures: number;
}

// ============================================
// Inbound Event Types
// ============================================

export type InboundEventStatus = 'delivered' | 'failed' | 'pending' | 'partial';

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
  signatureValid: number | null;
  receivedAt: string;
  ipAddress: string | null;
  sourceName: string;
  sourceSlug: string;
  status: InboundEventStatus;
  deliveryStats: DeliveryStats | null;
}

export interface EventDetail {
  id: string;
  sourceId: string;
  eventType: string | null;
  payload: unknown;
  headers: Record<string, string>;
  signatureValid: number | null;
  receivedAt: string;
  ipAddress: string | null;
  sourceName: string;
  deliveries: Array<{
    id: string;
    destinationId: string;
    destinationName: string;
    destinationUrl: string;
    status: string;
    statusCode: number | null;
    attempts: number;
    createdAt: string;
    completedAt: string | null;
  }>;
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
  offset?: number;
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

export type DeliveryStatus = 'pending' | 'success' | 'failed' | 'retrying';

export interface Delivery {
  id: string;
  eventId: string;
  routeId: string;
  destinationId: string;
  organizationId: string;
  status: DeliveryStatus;
  statusCode: number | null;
  attempts: number;
  maxAttempts: number;
  responseBody: string | null;
  error: string | null;
  duration: number | null;
  createdAt: string;
  completedAt: string | null;
  nextRetryAt: string | null;
}

export interface DeliveryDetail extends Delivery {
  event?: {
    id: string;
    eventType: string | null;
    receivedAt: string;
  };
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

export interface TransformTestResult {
  success: boolean;
  output?: unknown;
  error?: string;
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
  messageId: string;
  endpointId: string;
  endpointUrl?: string;
  applicationId: string;
  applicationName?: string;
  eventType: string;
  status: string;
  dlqReason: string | null;
  dlqMovedAt: string | null;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  lastResponseStatus: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DlqStats {
  total: number;
  byReason: Record<string, number>;
  topFailingEndpoints: Array<{
    endpointId: string;
    endpointUrl: string;
    count: number;
  }>;
}

export interface ListDlqParams {
  limit?: number;
  cursor?: string;
  endpointId?: string;
  applicationId?: string;
  dlqReason?: string;
  eventType?: string;
}

export interface DlqRetryResult {
  originalMessageId: string;
  newMessageId: string;
  status: string;
}

export interface DlqBulkRetryResult {
  total: number;
  retried: number;
  failed: number;
  results: Array<{
    messageId: string;
    status: string;
    newMessageId?: string;
    error?: string;
  }>;
}

export interface DlqBulkDeleteResult {
  total: number;
  deleted: number;
}

// ============================================
// Outbound Stats Types
// ============================================

export interface OutboundStatsSummary {
  pending: number;
  processing: number;
  success: number;
  failed: number;
  exhausted: number;
  dlq: number;
  total: number;
}

export interface ExportOutboundParams {
  format?: 'json' | 'csv';
  type?: 'events' | 'messages';
  startDate?: string;
  endDate?: string;
  status?: string;
  eventType?: string;
  applicationId?: string;
  limit?: number;
}

// ============================================
// Import/Export Types
// ============================================

export type ConflictStrategy = 'skip' | 'rename' | 'overwrite';

export interface ImportParams {
  conflictStrategy?: ConflictStrategy;
  validateOnly?: boolean;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: number;
  results: Array<{
    name: string;
    status: string;
    error?: string;
  }>;
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
