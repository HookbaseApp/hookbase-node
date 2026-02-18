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
    body: {
      error?: {
        message?: string;
        code?: string;
        details?: Record<string, unknown>;
      };
      message?: string;
      code?: string;
    },
    requestId?: string
  ): HookbaseApiError {
    const error = body.error ?? body;
    return new HookbaseApiError(
      error.message ?? `API error: ${status}`,
      status,
      error.code ?? 'unknown_error',
      requestId,
      body.error?.details
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
