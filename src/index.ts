// Main client exports
export { Hookbase, createClient } from './client';

// Webhook verification
export { Webhook, createWebhook } from './webhooks/verify';

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
} from './resources';

// Type exports
export type {
  // Pagination
  PaginationParams,
  PaginatedResponse,
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
  CreateEndpointInput,
  UpdateEndpointInput,
  ListEndpointsParams,
  EndpointStats,

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
  ListMessagesParams,
  ListOutboundMessagesParams,

  // Portal Tokens (outbound)
  PortalToken,
  CreatePortalTokenInput,

  // Sources (inbound)
  SourceProvider,
  DedupStrategy,
  IpFilterMode,
  Source,
  SourceWithSecret,
  CreateSourceInput,
  UpdateSourceInput,
  ListSourcesParams,

  // Destinations (inbound)
  HttpMethod,
  AuthType,
  Destination,
  CreateDestinationInput,
  UpdateDestinationInput,
  ListDestinationsParams,

  // Routes (inbound)
  CircuitStatus,
  CircuitBreakerConfig,
  Route,
  CreateRouteInput,
  UpdateRouteInput,
  ListRoutesParams,
  CircuitStatusInfo,

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
  ListDlqParams,
  DlqRetryResult,
  DlqBulkRetryResult,
  DlqBulkDeleteResult,

  // Outbound Stats
  OutboundStatsSummary,
  ExportOutboundParams,

  // Import/Export
  ConflictStrategy,
  ImportParams,
  ImportResult,

  // Webhook Verification
  WebhookHeaders,
  VerifyOptions,

  // Client Configuration
  HookbaseClientOptions,
  RequestOptions,
} from './types';
