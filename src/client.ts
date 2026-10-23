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
  AnalyticsResource,
  ApiKeysResource,
  TunnelsResource,
  CronJobsResource,
  ProvidersResource,
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
  extractErrorMessage,
  extractValidationErrors,
} from './errors';

const DEFAULT_BASE_URL = 'https://api.hookbase.app';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;
// Must match the version in package.json; version-sync.test.ts fails if it drifts. It rode at
// 2.1.0 through the 2.x and 3.0 releases, so every User-Agent those published reported the
// wrong SDK version to the API.
const SDK_VERSION = '4.1.0';

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
  /** Provider catalog: what each provider signs with and which secret it needs */
  public readonly providers: ProvidersResource;
  /** Dead letter queue resource (outbound) */
  public readonly dlq: DlqResource;
  /** Analytics resource */
  public readonly analytics: AnalyticsResource;
  /** API keys resource */
  public readonly apiKeys: ApiKeysResource;
  /** Tunnels resource */
  public readonly tunnels: TunnelsResource;
  /** Cron jobs resource */
  public readonly cronJobs: CronJobsResource;

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
    this.providers = new ProvidersResource(this);

    // Initialize admin resources
    this.analytics = new AnalyticsResource(this);
    this.apiKeys = new ApiKeysResource(this);
    this.tunnels = new TunnelsResource(this);
    this.cronJobs = new CronJobsResource(this);
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
    const idempotencyKey = options?.requestOptions?.idempotencyKey;
    // A POST that failed on a 5xx, a timeout or a dropped connection may still have been carried
    // out, so repeating it can create the thing twice (a second rotation, a second replay, a
    // second send). Only an idempotency key makes that safe, so without one a POST is not
    // retried on those failures, even when the caller passes `retries`. A 429 is still
    // retried: the API refused it, so nothing ran.
    const retryAmbiguousFailures = method.toUpperCase() !== 'POST' || !!idempotencyKey;
    // A negative count skipped the loop entirely and threw `undefined` without sending anything.
    const retries = Math.max(0, options?.requestOptions?.retries ?? this.retries);
    const signal = options?.requestOptions?.signal;

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

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
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
          signal
        );

        return response as T;
      } catch (error) {
        lastError = error as Error;

        // The caller cancelled: give up now. This used to be treated like a network failure, so a
        // cancelled GET went round the retry loop (with backoff) before the abort surfaced.
        if (signal?.aborted) {
          throw error;
        }

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
          // A wait longer than MAX_RETRY_AFTER_SECONDS (a quota window, or a far-off date) is
          // thrown to the caller with retryAfter set rather than slept through.
          if (attempt < retries && error.retryAfter <= MAX_RETRY_AFTER_SECONDS) {
            const waitTime = error.retryAfter * 1000;
            if (this.debug) {
              console.log(`[Hookbase] Rate limited, waiting ${waitTime}ms`);
            }
            await sleep(waitTime, signal);
            continue;
          }
          throw error;
        }

        // Any other 4xx is the API answering, not failing: sending the same request again gets
        // the same answer. Only 5xx, timeouts and network errors are worth another attempt.
        if (error instanceof HookbaseApiError && error.status < 500) {
          throw error;
        }

        // A connection that was never established cannot have reached the server, so resending
        // it is safe even for a POST without an idempotency key.
        if (!retryAmbiguousFailures && !neverSent(error)) {
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
          await sleep(waitTime, signal);
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

      // The timer stays armed until the body has been read (see `finally`): clearing it as soon
      // as the headers arrived left a stalled body read with no timeout at all.

      // Extract request ID from headers
      const requestId = response.headers.get('x-request-id') ?? undefined;

      // Handle successful response
      if (response.ok) {
        if (response.status === 204) {
          return undefined;
        }
        // CSV exports come back as text/csv; parsing those as JSON threw, and the SyntaxError
        // was then reported (and retried) as a network error.
        const contentType = response.headers.get('content-type');
        if (contentType && !/[/+]json\b/i.test(contentType)) {
          return await response.text();
        }
        return await response.json();
      }

      // Handle error responses
      let errorBody: Record<string, unknown> = {};
      try {
        errorBody = (await response.json()) as Record<string, unknown>;
      } catch {
        // Ignore JSON parse errors
      }

      // Hookbase sends `{ error: "<string>", code, details }` — `error` is a plain string on
      // almost every route, not `{ message, code }`. Casting it to that shape doesn't make it
      // one: `"<string>".message` is `undefined`, so every branch below used to fall straight
      // through to its class's generic default (e.g. "Rate limit exceeded" instead of the API's
      // own "You've used today's RCA budget (100/day on pro). Resets at UTC midnight.").
      // extractErrorMessage/extractValidationErrors read the real shape and still accept the
      // nested-object one, in case an endpoint ever sends that instead.
      switch (response.status) {
        case 401:
          throw new HookbaseAuthenticationError(
            extractErrorMessage(errorBody, 'Authentication failed'),
            requestId
          );

        case 403:
          throw new HookbaseForbiddenError(
            extractErrorMessage(errorBody, 'Access forbidden'),
            requestId
          );

        case 404:
          throw new HookbaseNotFoundError(
            extractErrorMessage(errorBody, 'Resource not found'),
            requestId
          );

        case 400:
        case 422:
          throw new HookbaseValidationError(
            extractErrorMessage(errorBody, 'Validation failed'),
            requestId,
            extractValidationErrors(errorBody),
            response.status
          );

        case 429:
          const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
          throw new HookbaseRateLimitError(
            extractErrorMessage(errorBody, 'Rate limit exceeded'),
            retryAfter,
            requestId
          );

        default:
          throw HookbaseApiError.fromResponse(response.status, errorBody, requestId);
      }
    } catch (error) {
      if (error instanceof HookbaseApiError) {
        throw error;
      }

      // Cancelled by the caller: surface their abort as-is (fetch rejects with the signal's
      // reason, which is not always an AbortError).
      if (signal?.aborted) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError' || timeoutController.signal.aborted) {
          throw new HookbaseTimeoutError(`Request timed out after ${timeout}ms`);
        }

        throw new HookbaseNetworkError(error.message, error);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const DEFAULT_RETRY_AFTER_SECONDS = 60;

/** The longest `Retry-After` the client waits out before retrying a 429. */
export const MAX_RETRY_AFTER_SECONDS = 60;

/**
 * Seconds to wait from a `Retry-After` header: delta-seconds or an HTTP-date (RFC 9110 10.2.3).
 * `parseInt` alone turned an HTTP-date into NaN, and `setTimeout(NaN)` retried immediately.
 */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number {
  if (header === null || header.trim() === '') return DEFAULT_RETRY_AFTER_SECONDS;
  const value = header.trim();
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - now) / 1000));
  return DEFAULT_RETRY_AFTER_SECONDS;
}

/** Connection-phase failures: the request never reached the server. */
const NEVER_SENT_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function neverSent(error: unknown): boolean {
  if (!(error instanceof HookbaseNetworkError)) return false;
  // undici's fetch reports `TypeError: fetch failed` with the socket error as its `cause`.
  let cause: unknown = error.cause;
  for (let depth = 0; cause && depth < 3; depth++) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === 'string' && NEVER_SENT_CODES.has(code)) return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
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
