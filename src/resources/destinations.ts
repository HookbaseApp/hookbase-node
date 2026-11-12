import { BaseResource, splitParams, type ApiClient } from './base';
import {
  createDestinationBody,
  importBody,
  updateDestinationBody,
  withDestinationTestAliases,
} from './wire';
import type {
  Destination,
  DestinationWithSecret,
  DestinationSigningSecret,
  RotateDestinationSecretParams,
  TestDestinationInput,
  CreateDestinationInput,
  UpdateDestinationInput,
  ListDestinationsParams,
  PaginatedResponse,
  RequestOptions,
  ImportResult,
  DestinationTestResult,
} from '../types';

/**
 * Destinations resource for managing webhook delivery destinations
 */
export class DestinationsResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List all destinations with page-based pagination
   */
  async list(
    params: ListDestinationsParams = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<Destination>> {
    const response = await this.client.request<{
      destinations: Destination[];
      pagination: { total: number; page: number; pageSize: number };
    }>('GET', '/api/destinations', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
    return {
      data: response.destinations,
      total: response.pagination.total,
      limit: response.pagination.pageSize,
      offset: (response.pagination.page - 1) * response.pagination.pageSize,
      hasMore: response.pagination.page * response.pagination.pageSize < response.pagination.total,
    };
  }

  /**
   * Async iterator to paginate through all destinations
   */
  async *listAll(
    params: Omit<ListDestinationsParams, 'page'> = {},
    options?: RequestOptions
  ): AsyncGenerator<Destination> {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.list({ ...params, page }, options);
      for (const item of response.data) {
        yield item;
      }
      hasMore = response.hasMore;
      page++;
    }
  }

  /**
   * Get a destination by ID
   */
  async get(id: string, options?: RequestOptions): Promise<Destination> {
    const response = await this.client.request<{
      destination: Destination;
    }>('GET', `/api/destinations/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
    return response.destination;
  }

  /**
   * Create a new destination.
   *
   * An `http` destination comes back with `signingSecret`, the `whsec_` secret its deliveries are
   * signed with, in full this once (`revealSecret` shows it again). Null for other types.
   */
  async create(
    data: CreateDestinationInput,
    options?: RequestOptions
  ): Promise<DestinationWithSecret> {
    const response = await this.client.request<{
      destination: DestinationWithSecret;
    }>('POST', '/api/destinations', {
      body: createDestinationBody(data),
      requestOptions: options,
    });
    const destination = response.destination;
    destination.signingSecret ??= null;
    return destination;
  }

  /**
   * Update a destination
   */
  async update(
    id: string,
    data: UpdateDestinationInput,
    options?: RequestOptions
  ): Promise<void> {
    await this.client.request('PATCH', `/api/destinations/${encodeURIComponent(id)}`, {
      body: updateDestinationBody(data),
      requestOptions: options,
    });
  }

  /**
   * Delete a destination
   */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this.client.request('DELETE', `/api/destinations/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
  }

  /**
   * Export destinations as JSON
   */
  async export(
    params: { ids?: string[] } = {},
    options?: RequestOptions
  ): Promise<unknown> {
    return this.client.request('GET', '/api/destinations/export', {
      query: params.ids ? { ids: params.ids.join(',') } : undefined,
      requestOptions: options,
    });
  }

  /**
   * Import destinations from JSON
   */
  async import(
    data: { destinations: Partial<Destination>[]; conflictStrategy?: string; validateOnly?: boolean },
    options?: RequestOptions
  ): Promise<ImportResult> {
    return this.client.request<ImportResult>('POST', '/api/destinations/import', {
      body: importBody(data),
      requestOptions: options,
    });
  }

  /**
   * Bulk delete destinations
   */
  async bulkDelete(
    ids: string[],
    options?: RequestOptions
  ): Promise<{ success: boolean; deleted: number }> {
    return this.client.request<{ success: boolean; deleted: number }>(
      'DELETE',
      '/api/destinations/bulk',
      { body: { ids }, requestOptions: options }
    );
  }

  /**
   * Test a destination.
   *
   * An `http` destination gets a real signed test request, and a warehouse destination a test
   * upload. A `bridge` destination's test is a dry run (`dryRun: true`): it resolves the event
   * type from `input.payload` (or a built-in sample), checks the type exists and is enabled, and
   * counts the subscribed endpoints, without publishing anything. Only a bridge reads `payload`.
   */
  async test(id: string, options?: RequestOptions): Promise<DestinationTestResult>;
  async test(
    id: string,
    input: TestDestinationInput,
    options?: RequestOptions
  ): Promise<DestinationTestResult>;
  async test(
    id: string,
    inputOrOptions?: TestDestinationInput | RequestOptions,
    maybeOptions?: RequestOptions
  ): Promise<DestinationTestResult> {
    const [input, options] = splitParams<TestDestinationInput>(inputOrOptions, maybeOptions, [
      'payload',
    ]);
    // The API answers with `status`/`latencyMs` (api/src/routes/destinations.ts). Those are now
    // returned under their own names; `statusCode`/`duration`, which this method used to rename
    // them to, are mirrored for existing callers. `error` is set on a failed test.
    const result = await this.client.request<DestinationTestResult>(
      'POST',
      `/api/destinations/${encodeURIComponent(id)}/test`,
      { body: input, requestOptions: options }
    );
    return withDestinationTestAliases(result);
  }

  /**
   * Show an `http` destination's signing secret. Needs a key with write scope. Any other type has
   * no secret, and the API answers 400.
   */
  async revealSecret(id: string, options?: RequestOptions): Promise<DestinationSigningSecret> {
    const result = await this.client.request<DestinationSigningSecret>(
      'GET',
      `/api/destinations/${encodeURIComponent(id)}/reveal-secret`,
      { requestOptions: options }
    );
    result.previousSecretExpiresAt ??= null;
    return result;
  }

  /**
   * Issue a new signing secret for an `http` destination. Needs a key with write scope.
   *
   * Until `previousSecretExpiresAt` deliveries are signed with both the old and the new secret, so
   * the receiver can switch over without rejecting any. Pass `{ gracePeriodSeconds }` (0-86400;
   * the API defaults to 3600) to choose how long; 0 retires the old secret at once.
   *
   * Not retried on a timeout or 5xx: a rotation that did go through and is then repeated
   * replaces the secret you were just handed.
   */
  async rotateSecret(id: string, options?: RequestOptions): Promise<DestinationSigningSecret>;
  async rotateSecret(
    id: string,
    params: RotateDestinationSecretParams,
    options?: RequestOptions
  ): Promise<DestinationSigningSecret>;
  async rotateSecret(
    id: string,
    paramsOrOptions?: RotateDestinationSecretParams | RequestOptions,
    maybeOptions?: RequestOptions
  ): Promise<DestinationSigningSecret> {
    const [params, options] = splitParams<RotateDestinationSecretParams>(
      paramsOrOptions,
      maybeOptions,
      ['gracePeriodSeconds']
    );
    const result = await this.client.request<DestinationSigningSecret>(
      'POST',
      `/api/destinations/${encodeURIComponent(id)}/rotate-secret`,
      { body: params, requestOptions: options }
    );
    result.previousSecretExpiresAt ??= null;
    return result;
  }
}
