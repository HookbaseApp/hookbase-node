import { BaseResource, type ApiClient } from './base';
import { endpointRequestBody, withEndpointAliases } from './wire';
import type {
  Endpoint,
  EndpointWithSecret,
  EndpointStats,
  CreateEndpointInput,
  UpdateEndpointInput,
  ListEndpointsParams,
  RotateEndpointSecretResult,
  RotateEndpointSecretParams,
  TestEndpointParams,
  EndpointTestResult,
  CursorPaginatedResponse,
  ApiResponse,
  RequestOptions,
} from '../types';

/**
 * Endpoints resource for managing webhook endpoints
 *
 * Endpoints are the destinations where webhooks are delivered.
 */
export class EndpointsResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List an application's endpoints, one page at a time. Pass the returned `cursor` back in as
   * `{ cursor }` for the next page.
   */
  async list(
    applicationId: string,
    params: Omit<ListEndpointsParams, 'applicationId'> = {},
    options?: RequestOptions
  ): Promise<CursorPaginatedResponse<Endpoint>> {
    return this.listPage<Endpoint>(
      '/api/webhook-endpoints',
      { ...this.buildQuery(params), applicationId },
      options,
      withEndpointAliases
    );
  }

  /**
   * Create an async iterator to paginate through all endpoints
   */
  async *listAll(
    applicationId: string,
    params: Omit<ListEndpointsParams, 'applicationId' | 'offset'> = {},
    options?: RequestOptions
  ): AsyncGenerator<Endpoint> {
    yield* this.iterate<Endpoint>(
      '/api/webhook-endpoints',
      { ...this.buildQuery(params), applicationId, limit: params.limit ?? 100 },
      options,
      withEndpointAliases
    );
  }

  /**
   * Get an endpoint by ID
   */
  async get(
    applicationId: string,
    endpointId: string,
    options?: RequestOptions
  ): Promise<Endpoint> {
    const response = await this.client.request<ApiResponse<Endpoint>>(
      'GET',
      `/api/webhook-endpoints/${encodeURIComponent(endpointId)}`,
      { requestOptions: options }
    );
    return withEndpointAliases(response.data);
  }

  /**
   * Create a new endpoint
   */
  async create(
    applicationId: string,
    data: CreateEndpointInput,
    options?: RequestOptions
  ): Promise<EndpointWithSecret> {
    const response = await this.client.request<ApiResponse<EndpointWithSecret>>(
      'POST',
      '/api/webhook-endpoints',
      { body: { ...endpointRequestBody(data), applicationId }, requestOptions: options }
    );
    return withEndpointAliases(response.data);
  }

  /**
   * Update an endpoint
   */
  async update(
    applicationId: string,
    endpointId: string,
    data: UpdateEndpointInput,
    options?: RequestOptions
  ): Promise<Endpoint> {
    const response = await this.client.request<ApiResponse<Endpoint>>(
      'PATCH',
      `/api/webhook-endpoints/${encodeURIComponent(endpointId)}`,
      { body: endpointRequestBody(data), requestOptions: options }
    );
    return withEndpointAliases(response.data);
  }

  /**
   * Delete an endpoint
   */
  async delete(
    applicationId: string,
    endpointId: string,
    options?: RequestOptions
  ): Promise<void> {
    await this.client.request(
      'DELETE',
      `/api/webhook-endpoints/${encodeURIComponent(endpointId)}`,
      { requestOptions: options }
    );
  }

  /**
   * Rotate the signing secret for an endpoint. The API keeps signing with the previous secret as
   * well until `previousSecretExpiresAt` (one hour by default).
   *
   * The result depends on the endpoint's signature scheme, so narrow on `signatureScheme`: an
   * `hmac-sha256` endpoint gets a new `secret` (`whsec_...`, shown once); an `ed25519` endpoint gets
   * a new key pair, of which you receive `publicKey` and the outgoing `previousPublicKey` (both
   * `whpk_...`), and no `secret`.
   *
   * Pass `{ gracePeriodSeconds }` (0-86400; the API defaults to 3600) to choose how long the
   * previous key keeps signing; 0 retires it immediately.
   *
   * Not retried on a timeout or 5xx: a rotation that did go through and is then repeated
   * replaces the secret you were just handed.
   */
  async rotateSecret(
    applicationId: string,
    endpointId: string,
    options?: RequestOptions
  ): Promise<RotateEndpointSecretResult>;
  async rotateSecret(
    applicationId: string,
    endpointId: string,
    params: RotateEndpointSecretParams,
    options?: RequestOptions
  ): Promise<RotateEndpointSecretResult>;
  async rotateSecret(
    applicationId: string,
    endpointId: string,
    paramsOrOptions?: RotateEndpointSecretParams | RequestOptions,
    maybeOptions?: RequestOptions
  ): Promise<RotateEndpointSecretResult> {
    const [params, options] = splitParams<RotateEndpointSecretParams>(
      paramsOrOptions,
      maybeOptions,
      ['gracePeriodSeconds']
    );
    return this.client.request<RotateEndpointSecretResult>(
      'POST',
      `/api/webhook-endpoints/${encodeURIComponent(endpointId)}/rotate-secret`,
      { body: params, requestOptions: options }
    );
  }

  /**
   * Enable an endpoint
   */
  async enable(
    applicationId: string,
    endpointId: string,
    options?: RequestOptions
  ): Promise<Endpoint> {
    return this.update(applicationId, endpointId, { isDisabled: false }, options);
  }

  /**
   * Disable an endpoint
   */
  async disable(
    applicationId: string,
    endpointId: string,
    options?: RequestOptions
  ): Promise<Endpoint> {
    return this.update(applicationId, endpointId, { isDisabled: true }, options);
  }

  /**
   * Get endpoint statistics (extracted from endpoint data)
   */
  async getStats(
    applicationId: string,
    endpointId: string,
    options?: RequestOptions
  ): Promise<EndpointStats> {
    const ep = await this.get(applicationId, endpointId, options);
    return {
      totalMessages: ep.totalMessages ?? 0,
      totalSuccesses: ep.totalSuccesses ?? 0,
      totalFailures: ep.totalFailures ?? 0,
      successRate: ep.totalMessages > 0
        ? (ep.totalSuccesses / ep.totalMessages) * 100
        : 0,
      // The API returns this as avgResponseTimeMs. It was hardcoded to 0 because `Endpoint` had no
      // field for it, so every caller of getStats saw a latency of zero on every endpoint.
      averageLatency: ep.avgResponseTimeMs ?? 0,
      recentFailures: 0,
    };
  }

  /**
   * Recover/reset a circuit breaker
   */
  async recoverCircuit(
    applicationId: string,
    endpointId: string,
    options?: RequestOptions
  ): Promise<Endpoint> {
    await this.client.request(
      'POST',
      `/api/webhook-endpoints/${encodeURIComponent(endpointId)}/reset-circuit`,
      { requestOptions: options }
    );
    return this.get(applicationId, endpointId, options);
  }

  /**
   * Send a test event to an endpoint and report how the endpoint answered. Optionally pick the
   * event type and payload; the API generates a test payload otherwise.
   */
  async test(
    applicationId: string,
    endpointId: string,
    options?: RequestOptions
  ): Promise<EndpointTestResult>;
  async test(
    applicationId: string,
    endpointId: string,
    params: TestEndpointParams,
    options?: RequestOptions
  ): Promise<EndpointTestResult>;
  async test(
    applicationId: string,
    endpointId: string,
    paramsOrOptions?: TestEndpointParams | RequestOptions,
    maybeOptions?: RequestOptions
  ): Promise<EndpointTestResult> {
    const [params, options] = splitParams<TestEndpointParams>(paramsOrOptions, maybeOptions, [
      'eventType',
      'payload',
    ]);
    return this.client.request<EndpointTestResult>(
      'POST',
      `/api/webhook-endpoints/${encodeURIComponent(endpointId)}/test`,
      { body: params, requestOptions: options }
    );
  }
}

/**
 * Tell a params object from RequestOptions in the optional third argument (the two have no keys
 * in common), so methods that gained params keep accepting `(appId, id, options)`.
 */
function splitParams<P extends object>(
  paramsOrOptions: P | RequestOptions | undefined,
  maybeOptions: RequestOptions | undefined,
  paramKeys: Array<keyof P>
): [P | undefined, RequestOptions | undefined] {
  if (maybeOptions !== undefined) return [paramsOrOptions as P | undefined, maybeOptions];
  if (paramsOrOptions && paramKeys.some((k) => k in paramsOrOptions)) {
    return [paramsOrOptions as P, undefined];
  }
  return [undefined, paramsOrOptions as RequestOptions | undefined];
}
