// Main client exports
export { Hookbase, createClient } from './client';

// Webhook verification
export { Webhook, createWebhook } from './webhooks/verify';
export type { WebhookHeadersInput, WebhookPayload } from './webhooks/verify';

// Error classes
export {
  HookbaseError,
  HookbaseApiError,
  HookbaseAuthenticationError,
  HookbaseForbiddenError,
  HookbaseNotFoundError,
  HookbaseValidationError,
  HookbaseRateLimitError,
  HookbaseTimeoutError,
  HookbaseNetworkError,
  HookbaseWebhookVerificationError,
} from './errors';

// Resource classes (for advanced use cases)
export {
  ApplicationsResource,
  EndpointsResource,
  EventTypesResource,
  SubscriptionsResource,
  MessagesResource,
  PortalTokensResource,
  SourcesResource,
  DestinationsResource,
  RoutesResource,
  EventsResource,
  DeliveriesResource,
  TransformsResource,
  FiltersResource,
  SchemasResource,
  DlqResource,
  AnalyticsResource,
  ApiKeysResource,
  TunnelsResource,
  CronJobsResource,
  ProvidersResource,
} from './resources';

// Type exports
export type {
  // Pagination
  PaginationParams,
  PaginatedResponse,
  CursorPaginatedResponse,
  ApiResponse,
  SortOrder,

  // Applications (outbound)
  Application,
  CreateApplicationInput,
  UpdateApplicationInput,
  ListApplicationsParams,

  // Endpoints (outbound)
  CircuitState,
  Endpoint,
  EndpointWithSecret,
  EndpointHeader,
  EndpointHeadersInput,
  BackoffType,
  SuccessStatusCode,
  CreateEndpointInput,
  UpdateEndpointInput,
  ListEndpointsParams,
  EndpointStats,
  RotateEndpointSecretResult,
  RotateHmacEndpointSecretResult,
  RotateEd25519EndpointSecretResult,
  SignatureScheme,

  // Event Types (outbound)
  EventType,
  CreateEventTypeInput,
  UpdateEventTypeInput,
  ListEventTypesParams,

  // Subscriptions (outbound)
  Subscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  ListSubscriptionsParams,

  // Messages (outbound)
  MessageStatus,
  Message,
  OutboundMessage,
  MessageAttempt,
  SendMessageInput,
  SendMessageResponse,
  MessageReplayResult,
  ListMessagesParams,
  ListOutboundMessagesParams,

  // Portal Tokens (outbound)
  PortalToken,
  CreatePortalTokenInput,

  // Sources (inbound)
  KnownSourceProvider,
  SourceProvider,
  PendingVerification,
  DedupStrategy,
  IpFilterMode,
  Source,
  SourceWithSecret,
  CreateSourceInput,
  UpdateSourceInput,
  ListSourcesParams,

  // Provider catalog
  ProviderSecretSource,
  ProviderSignatureKind,
  ProviderSignatureVerificationSummary,
  ProviderSignatureVerification,
  ProviderEventType,
  CatalogProvider,
  ProviderCatalogList,
  CatalogProviderDetail,
  ProviderEvents,
  ListCatalogProvidersParams,

  // Destinations (inbound)
  HttpMethod,
  AuthType,
  Destination,
  CreateDestinationInput,
  UpdateDestinationInput,
  ListDestinationsParams,
  DestinationTestResult,

  // Routes (inbound)
  CircuitStatus,
  CircuitBreakerConfig,
  Route,
  CreateRouteInput,
  UpdateRouteInput,
  ListRoutesParams,
  CircuitStatusInfo,
  CircuitResetResult,

  // Events (inbound)
  InboundEventStatus,
  DeliveryStats,
  InboundEvent,
  EventDetail,
  EventDebugInfo,
  ListEventsParams,
  ExportEventsParams,

  // Deliveries (inbound)
  DeliveryStatus,
  Delivery,
  DeliveryDetail,
  ListDeliveriesParams,
  ReplayResult,
  BulkReplayResult,

  // Transforms (inbound)
  TransformType,
  ContentFormat,
  Transform,
  CreateTransformInput,
  UpdateTransformInput,
  ListTransformsParams,
  TransformTestInput,
  TransformTestResult,

  // Filters (inbound)
  FilterCondition,
  Filter,
  CreateFilterInput,
  UpdateFilterInput,
  ListFiltersParams,
  FilterTestInput,
  FilterTestResult,

  // Schemas (inbound)
  Schema,
  CreateSchemaInput,
  UpdateSchemaInput,
  ListSchemasParams,
  SchemaValidationResult,

  // DLQ (outbound)
  DlqMessage,
  DlqStats,
  DlqEndpointCount,
  ListDlqParams,
  DlqRetryResult,
  DlqBulkRetryResult,
  DlqBulkDeleteResult,

  // Outbound Stats
  OutboundStatsSummary,
  ExportOutboundParams,
  OutboundExport,
  OutboundEventExportRow,
  OutboundMessageExportRow,

  // Import/Export
  ConflictStrategy,
  ImportParams,
  ImportResult,
  ImportSummary,
  ImportDetails,
  ImportFailure,
  ImportValidationResult,

  // Webhook Verification
  WebhookHeaders,
  VerifyOptions,

  // Client Configuration
  HookbaseClientOptions,
  RequestOptions,
} from './types';

// Cron Jobs — declared alongside CronJobsResource in resources/cronJobs.ts rather than
// types/index.ts like every other resource's types, which is how they ended up missing from
// this file: nothing importing by name could ever have worked.
export type {
  CronJob,
  CronJobExecution,
  CronGroup,
  CreateCronJobInput,
  UpdateCronJobInput,
  CreateCronGroupInput,
} from './resources/cronJobs';

// Tunnels — declared alongside TunnelsResource, like the cron job types above.
export type { Tunnel, CreateTunnelInput } from './resources/tunnels';
