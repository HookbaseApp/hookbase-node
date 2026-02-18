import { BaseResource, type ApiClient } from './base';
import type {
  Destination,
  CreateDestinationInput,
  UpdateDestinationInput,
  ListDestinationsParams,
  PaginatedResponse,
  RequestOptions,
  ImportResult,
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
   * Create a new destination
   */
  async create(
    data: CreateDestinationInput,
    options?: RequestOptions
  ): Promise<Destination> {
    const response = await this.client.request<{
      destination: Destination;
    }>('POST', '/api/destinations', {
      body: data,
      requestOptions: options,
    });
    return response.destination;
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
      body: data,
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
      body: data,
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
   * Test a destination by sending a test request
   */
  async test(
    id: string,
    options?: RequestOptions
  ): Promise<{ success: boolean; statusCode: number; duration: number; responseBody: string }> {
    return this.client.request('POST', `/api/destinations/${encodeURIComponent(id)}/test`, {
      requestOptions: options,
    });
  }
}
