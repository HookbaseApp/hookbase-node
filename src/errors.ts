/**
 * The shape an error response body can take. Hookbase almost always sends `error` as a plain
 * string (`{ error: "You've used today's RCA budget...", code: "...", details: {...} }`), not
 * `{ error: { message, code } }` — but reading `body.error?.message` unconditionally treats the
 * string as an object, which silently returns `undefined` (a string has no `.message`) rather
 * than throwing. Every caller of these got the class's generic default instead of Hookbase's own,
 * often actionable, text — e.g. "Rate limit exceeded" instead of "You've used today's RCA budget
 * (100/day on pro). Resets at UTC midnight." The object shape is still accepted here in case an
 * endpoint ever nests it.
 */
export interface ApiErrorBody {
  error?: string | { message?: string; code?: string; details?: Record<string, unknown> };
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

export function extractErrorMessage(body: ApiErrorBody, fallback: string): string {
  if (typeof body.error === 'string' && body.error) return body.error;
  if (body.error && typeof body.error === 'object' && body.error.message) return body.error.message;
  if (body.message) return body.message;
  return fallback;
}

export function extractErrorCode(body: ApiErrorBody, fallback: string): string {
  if (body.error && typeof body.error === 'object' && body.error.code) return body.error.code;
  if (body.code) return body.code;
  return fallback;
}

export function extractErrorDetails(body: ApiErrorBody): Record<string, unknown> | undefined {
  if (body.error && typeof body.error === 'object' && body.error.details) return body.error.details;
  return body.details;
}

/**
 * Field-level validation messages, if the API sent any. Zod's `.flatten()` — what every route
 * actually sends under `details` — shapes them as `{ fieldErrors: Record<string, string[]> }`,
 * not the `{ validationErrors }` this SDK used to look for under `error` (which was doubly wrong:
 * `error` is a string, and the field never lived there even when it was an object).
 */
export function extractValidationErrors(body: ApiErrorBody): Record<string, string[]> | undefined {
  const details = extractErrorDetails(body);
  const fieldErrors = details?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === 'object') {
    return fieldErrors as Record<string, string[]>;
  }
  return undefined;
}

/**
 * Base error class for all Hookbase SDK errors
 */
export class HookbaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookbaseError';
    Object.setPrototypeOf(this, HookbaseError.prototype);
  }
}

/**
 * Error thrown when the API returns an error response
 */
export class HookbaseApiError extends HookbaseError {
  public readonly status: number;
  public readonly code: string;
  public readonly requestId?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code: string,
    requestId?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'HookbaseApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
    Object.setPrototypeOf(this, HookbaseApiError.prototype);
  }

  static fromResponse(
    status: number,
    body: ApiErrorBody,
    requestId?: string
  ): HookbaseApiError {
    return new HookbaseApiError(
      extractErrorMessage(body, `API error: ${status}`),
      status,
      extractErrorCode(body, 'unknown_error'),
      requestId,
      extractErrorDetails(body)
    );
  }
}

/**
 * Error thrown when authentication fails
 */
export class HookbaseAuthenticationError extends HookbaseApiError {
  constructor(message: string = 'Authentication failed', requestId?: string) {
    super(message, 401, 'authentication_error', requestId);
    this.name = 'HookbaseAuthenticationError';
    Object.setPrototypeOf(this, HookbaseAuthenticationError.prototype);
  }
}

/**
 * Error thrown when the request is forbidden
 */
export class HookbaseForbiddenError extends HookbaseApiError {
  constructor(message: string = 'Access forbidden', requestId?: string) {
    super(message, 403, 'forbidden', requestId);
    this.name = 'HookbaseForbiddenError';
    Object.setPrototypeOf(this, HookbaseForbiddenError.prototype);
  }
}

/**
 * Error thrown when a resource is not found
 */
export class HookbaseNotFoundError extends HookbaseApiError {
  constructor(message: string = 'Resource not found', requestId?: string) {
    super(message, 404, 'not_found', requestId);
    this.name = 'HookbaseNotFoundError';
    Object.setPrototypeOf(this, HookbaseNotFoundError.prototype);
  }
}

/**
 * Error thrown when the request is invalid
 */
export class HookbaseValidationError extends HookbaseApiError {
  public readonly validationErrors?: Record<string, string[]>;

  constructor(
    message: string = 'Validation failed',
    requestId?: string,
    validationErrors?: Record<string, string[]>
  ) {
    super(message, 400, 'validation_error', requestId, { validationErrors });
    this.name = 'HookbaseValidationError';
    this.validationErrors = validationErrors;
    Object.setPrototypeOf(this, HookbaseValidationError.prototype);
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class HookbaseRateLimitError extends HookbaseApiError {
  public readonly retryAfter: number;

  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter: number = 60,
    requestId?: string
  ) {
    super(message, 429, 'rate_limit_exceeded', requestId, { retryAfter });
    this.name = 'HookbaseRateLimitError';
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, HookbaseRateLimitError.prototype);
  }
}

/**
 * Error thrown when the request times out
 */
export class HookbaseTimeoutError extends HookbaseError {
  constructor(message: string = 'Request timed out') {
    super(message);
    this.name = 'HookbaseTimeoutError';
    Object.setPrototypeOf(this, HookbaseTimeoutError.prototype);
  }
}

/**
 * Error thrown when a network error occurs
 */
export class HookbaseNetworkError extends HookbaseError {
  public readonly cause?: Error;

  constructor(message: string = 'Network error', cause?: Error) {
    super(message);
    this.name = 'HookbaseNetworkError';
    this.cause = cause;
    Object.setPrototypeOf(this, HookbaseNetworkError.prototype);
  }
}

/**
 * Error thrown when webhook signature verification fails
 */
export class HookbaseWebhookVerificationError extends HookbaseError {
  constructor(message: string = 'Webhook signature verification failed') {
    super(message);
    this.name = 'HookbaseWebhookVerificationError';
    Object.setPrototypeOf(this, HookbaseWebhookVerificationError.prototype);
  }
}
