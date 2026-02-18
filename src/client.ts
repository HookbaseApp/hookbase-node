import type { HookbaseClientOptions, RequestOptions } from './types';
import type { ApiClient } from './resources/base';
import {
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
import {
  HookbaseApiError,
  HookbaseAuthenticationError,
  HookbaseForbiddenError,
  HookbaseNotFoundError,
  HookbaseValidationError,
  HookbaseRateLimitError,
  HookbaseTimeoutError,
  HookbaseNetworkError,
} from './errors';

const DEFAULT_BASE_URL = 'https://api.hookbase.app';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;
const SDK_VERSION = '1.0.0';

/**
 * Hookbase API client
 *
 * The main entry point for interacting with the Hookbase API.
 *
 * @example
 * ```ts
 * import { Hookbase } from '@hookbase/sdk';
 *
 * const hookbase = new Hookbase({
 *   apiKey: 'your_api_key'
 * });
 *
 * // Send a webhook
 * await hookbase.messages.send('app_123', {
 *   eventType: 'order.created',
 *   payload: { orderId: '123' }
 * });
 * ```
 */
export class Hookbase implements ApiClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private fetchFn: typeof fetch;
  private debug: boolean;

  /** Applications resource (outbound) */
  public readonly applications: ApplicationsResource;
  /** Endpoints resource (outbound) */
  public readonly endpoints: EndpointsResource;
  /** Event types resource (outbound) */
  public readonly eventTypes: EventTypesResource;
  /** Subscriptions resource (outbound) */
  public readonly subscriptions: SubscriptionsResource;
  /** Messages resource (outbound) */
  public readonly messages: MessagesResource;
  /** Portal tokens resource (outbound) */
  public readonly portalTokens: PortalTokensResource;
  /** Sources resource (inbound) */
  public readonly sources: SourcesResource;
  /** Destinations resource (inbound) */
  public readonly destinations: DestinationsResource;
  /** Routes resource (inbound) */
  public readonly routes: RoutesResource;
  /** Events resource (inbound) */
  public readonly events: EventsResource;
  /** Deliveries resource (inbound) */
  public readonly deliveries: DeliveriesResource;
  /** Transforms resource (inbound) */
  public readonly transforms: TransformsResource;
  /** Filters resource (inbound) */
  public readonly filters: FiltersResource;
  /** Schemas resource (inbound) */
  public readonly schemas: SchemasResource;
  /** Dead letter queue resource (outbound) */
  public readonly dlq: DlqResource;

  constructor(options: HookbaseClientOptions) {
    if (!options.apiKey) {
      throw new Error('API key is required');
    }

    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.fetchFn = options.fetch ?? fetch;
    this.debug = options.debug ?? false;

    // Initialize outbound resources
    this.applications = new ApplicationsResource(this);
    this.endpoints = new EndpointsResource(this);
    this.eventTypes = new EventTypesResource(this);
    this.subscriptions = new SubscriptionsResource(this);
    this.messages = new MessagesResource(this);
    this.portalTokens = new PortalTokensResource(this);
    this.dlq = new DlqResource(this);

    // Initialize inbound resources
    this.sources = new SourcesResource(this);
    this.destinations = new DestinationsResource(this);
    this.routes = new RoutesResource(this);
    this.events = new EventsResource(this);
    this.deliveries = new DeliveriesResource(this);
    this.transforms = new TransformsResource(this);
    this.filters = new FiltersResource(this);
    this.schemas = new SchemasResource(this);
  }

  /**
   * Make a raw API request
   *
   * This is used internally by resource classes but can also be used
   * directly for custom API calls.
   *
   * @param method - HTTP method
   * @param path - API path
   * @param options - Request options
   * @returns Response data
   */
  async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
      requestOptions?: RequestOptions;
    }
  ): Promise<T> {
    const timeout = options?.requestOptions?.timeout ?? this.timeout;
    const retries = options?.requestOptions?.retries ?? this.retries;

    // Build URL with query parameters
    let url = `${this.baseUrl}${path}`;
    if (options?.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    // Build headers
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'User-Agent': `hookbase-sdk-node/${SDK_VERSION}`,
      Accept: 'application/json',
    };

    if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (options?.requestOptions?.idempotencyKey) {
      headers['Idempotency-Key'] = options.requestOptions.idempotencyKey;
    }

    // Debug logging
    if (this.debug) {
      console.log(`[Hookbase] ${method} ${url}`);
      if (options?.body) {
        console.log('[Hookbase] Body:', JSON.stringify(options.body, null, 2));
      }
    }

    // Execute request with retries
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.executeRequest(
          method,
          url,
          headers,
          options?.body,
          timeout,
          options?.requestOptions?.signal
        );

        return response as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (
          error instanceof HookbaseAuthenticationError ||
          error instanceof HookbaseForbiddenError ||
          error instanceof HookbaseValidationError ||
          error instanceof HookbaseNotFoundError
        ) {
          throw error;
        }

        // Handle rate limiting with backoff
        if (error instanceof HookbaseRateLimitError) {
          if (attempt < retries) {
            const waitTime = error.retryAfter * 1000;
            if (this.debug) {
              console.log(`[Hookbase] Rate limited, waiting ${waitTime}ms`);
            }
            await sleep(waitTime);
            continue;
          }
          throw error;
        }

        // Exponential backoff for retryable errors
        if (attempt < retries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
          const jitter = Math.random() * 1000;
          const waitTime = backoff + jitter;

          if (this.debug) {
            console.log(
              `[Hookbase] Request failed, retrying in ${Math.round(waitTime)}ms (attempt ${attempt + 1}/${retries})`
            );
          }
          await sleep(waitTime);
        }
      }
    }

    throw lastError;
  }

  private async executeRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: unknown,
    timeout: number,
    signal?: AbortSignal
  ): Promise<unknown> {
    // Create timeout abort controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

    // Combine signals if provided
    const combinedSignal = signal
      ? combineAbortSignals(signal, timeoutController.signal)
      : timeoutController.signal;

    try {
      const response = await this.fetchFn(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: combinedSignal,
      });

      clearTimeout(timeoutId);

      // Extract request ID from headers
      const requestId = response.headers.get('x-request-id') ?? undefined;

      // Handle successful response
      if (response.ok) {
        if (response.status === 204) {
          return undefined;
        }
        return response.json();
      }

      // Handle error responses
      let errorBody: Record<string, unknown> = {};
      try {
        errorBody = (await response.json()) as Record<string, unknown>;
      } catch {
        // Ignore JSON parse errors
      }

      switch (response.status) {
        case 401:
          throw new HookbaseAuthenticationError(
            (errorBody.error as { message?: string })?.message ??
              (errorBody.message as string),
            requestId
          );

        case 403:
          throw new HookbaseForbiddenError(
            (errorBody.error as { message?: string })?.message ??
              (errorBody.message as string),
            requestId
          );

        case 404:
          throw new HookbaseNotFoundError(
            (errorBody.error as { message?: string })?.message ??
              (errorBody.message as string),
            requestId
          );

        case 400:
        case 422:
          throw new HookbaseValidationError(
            (errorBody.error as { message?: string })?.message ??
              (errorBody.message as string),
            requestId,
            (errorBody.error as { validationErrors?: Record<string, string[]> })
              ?.validationErrors
          );

        case 429:
          const retryAfter = parseInt(
            response.headers.get('retry-after') ?? '60',
            10
          );
          throw new HookbaseRateLimitError(
            (errorBody.error as { message?: string })?.message ??
              (errorBody.message as string),
            retryAfter,
            requestId
          );

        default:
          throw HookbaseApiError.fromResponse(
            response.status,
            errorBody as { error?: { message?: string; code?: string }; message?: string; code?: string },
            requestId
          );
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof HookbaseApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          if (signal?.aborted) {
            throw error;
          }
          throw new HookbaseTimeoutError(`Request timed out after ${timeout}ms`);
        }

        throw new HookbaseNetworkError(error.message, error);
      }

      throw error;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }

    signal.addEventListener(
      'abort',
      () => controller.abort(signal.reason),
      { once: true }
    );
  }

  return controller.signal;
}

/**
 * Create a new Hookbase client instance
 *
 * @param options - Client configuration options
 * @returns A configured Hookbase client
 *
 * @example
 * ```ts
 * import { createClient } from '@hookbase/sdk';
 *
 * const hookbase = createClient({
 *   apiKey: process.env.HOOKBASE_API_KEY
 * });
 * ```
 */
export function createClient(options: HookbaseClientOptions): Hookbase {
  return new Hookbase(options);
}
