import { BaseResource, type ApiClient } from './base';
import type {
  Filter,
  CreateFilterInput,
  UpdateFilterInput,
  ListFiltersParams,
  FilterTestInput,
  FilterTestResult,
  PaginatedResponse,
  RequestOptions,
} from '../types';

/**
 * Filters resource for managing webhook routing filters
 */
export class FiltersResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List all filters with page-based pagination
   */
  async list(
    params: ListFiltersParams = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<Filter>> {
    const response = await this.client.request<{
      filters: Filter[];
      pagination: { total: number; page: number; pageSize: number };
    }>('GET', '/api/filters', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
    return {
      data: response.filters,
      total: response.pagination.total,
      limit: response.pagination.pageSize,
      offset: (response.pagination.page - 1) * response.pagination.pageSize,
      hasMore: response.pagination.page * response.pagination.pageSize < response.pagination.total,
    };
  }

  /**
   * Async iterator to paginate through all filters
   */
  async *listAll(
    params: Omit<ListFiltersParams, 'page'> = {},
    options?: RequestOptions
  ): AsyncGenerator<Filter> {
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
   * Get a filter by ID
   */
  async get(id: string, options?: RequestOptions): Promise<Filter> {
    const response = await this.client.request<{
      filter: Filter;
    }>('GET', `/api/filters/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
    return response.filter;
  }

  /**
   * Create a new filter
   */
  async create(
    data: CreateFilterInput,
    options?: RequestOptions
  ): Promise<Filter> {
    const response = await this.client.request<{
      filter: Filter;
    }>('POST', '/api/filters', {
      body: data,
      requestOptions: options,
    });
    return response.filter;
  }

  /**
   * Update a filter
   */
  async update(
    id: string,
    data: UpdateFilterInput,
    options?: RequestOptions
  ): Promise<void> {
    await this.client.request('PATCH', `/api/filters/${encodeURIComponent(id)}`, {
      body: data,
      requestOptions: options,
    });
  }

  /**
   * Delete a filter
   */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this.client.request('DELETE', `/api/filters/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
  }

  /**
   * Test filter conditions against a payload
   */
  async test(
    data: FilterTestInput,
    options?: RequestOptions
  ): Promise<FilterTestResult> {
    return this.client.request<FilterTestResult>(
      'POST',
      '/api/filters/test',
      { body: data, requestOptions: options }
    );
  }
}
