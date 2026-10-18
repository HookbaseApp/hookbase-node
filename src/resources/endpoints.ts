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
      `/api/webhook-endpoints/${endpointId}`,
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
      `/api/webhook-endpoints/${endpointId}`,
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
      `/api/webhook-endpoints/${endpointId}`,
      { requestOptions: options }
    );
  }

  /**
   * Rotate the signing secret for an endpoint. The API keeps signing with the previous secret as
   * well until `previousSecretExpiresAt` (one hour by default).
   *
   * Not retried automatically on a timeout or 5xx unless you pass `retries`: a rotation that did
   * go through and is then repeated replaces the secret you were just handed.
   */
  async rotateSecret(
    applicationId: string,
    endpointId: string,
    options?: RequestOptions
  ): Promise<RotateEndpointSecretResult> {
    return this.client.request<RotateEndpointSecretResult>(
      'POST',
      `/api/webhook-endpoints/${endpointId}/rotate-secret`,
      { requestOptions: options }
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
      `/api/webhook-endpoints/${endpointId}/reset-circuit`,
      { requestOptions: options }
    );
    return this.get(applicationId, endpointId, options);
  }

  /**
   * Send a test event to an endpoint
   */
  async test(
    applicationId: string,
    endpointId: string,
    options?: RequestOptions
  ): Promise<unknown> {
    return this.client.request(
      'POST',
      `/api/webhook-endpoints/${endpointId}/test`,
      { requestOptions: options }
    );
  }
}
