import { BaseResource, type ApiClient } from './base';
import type {
  Route,
  CreateRouteInput,
  UpdateRouteInput,
  ListRoutesParams,
  CircuitStatusInfo,
  CircuitBreakerConfig,
  PaginatedResponse,
  RequestOptions,
  ImportResult,
} from '../types';

/**
 * Routes resource for managing webhook routing rules
 */
export class RoutesResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List all routes with page-based pagination
   */
  async list(
    params: ListRoutesParams = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<Route>> {
    const response = await this.client.request<{
      routes: Route[];
      pagination: { total: number; page: number; pageSize: number };
    }>('GET', '/api/routes', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
    return {
      data: response.routes,
      total: response.pagination.total,
      limit: response.pagination.pageSize,
      offset: (response.pagination.page - 1) * response.pagination.pageSize,
      hasMore: response.pagination.page * response.pagination.pageSize < response.pagination.total,
    };
  }

  /**
   * Async iterator to paginate through all routes
   */
  async *listAll(
    params: Omit<ListRoutesParams, 'page'> = {},
    options?: RequestOptions
  ): AsyncGenerator<Route> {
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
   * Get a route by ID
   */
  async get(id: string, options?: RequestOptions): Promise<Route> {
    const response = await this.client.request<{
      route: Route;
    }>('GET', `/api/routes/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
    return response.route;
  }

  /**
   * Create a new route
   */
  async create(
    data: CreateRouteInput,
    options?: RequestOptions
  ): Promise<Route> {
    const response = await this.client.request<{
      route: Route;
    }>('POST', '/api/routes', {
      body: data,
      requestOptions: options,
    });
    return response.route;
  }

  /**
   * Update a route
   */
  async update(
    id: string,
    data: UpdateRouteInput,
    options?: RequestOptions
  ): Promise<void> {
    await this.client.request('PATCH', `/api/routes/${encodeURIComponent(id)}`, {
      body: data,
      requestOptions: options,
    });
  }

  /**
   * Delete a route
   */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this.client.request('DELETE', `/api/routes/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
  }

  /**
   * Bulk delete routes
   */
  async bulkDelete(
    ids: string[],
    options?: RequestOptions
  ): Promise<{ success: boolean; deleted: number }> {
    return this.client.request<{ success: boolean; deleted: number }>(
      'DELETE',
      '/api/routes/bulk',
      { body: { ids }, requestOptions: options }
    );
  }

  /**
   * Bulk update routes (enable/disable)
   */
  async bulkUpdate(
    ids: string[],
    data: { isActive: boolean },
    options?: RequestOptions
  ): Promise<{ success: boolean; updated: number }> {
    return this.client.request<{ success: boolean; updated: number }>(
      'PATCH',
      '/api/routes/bulk',
      { body: { ids, ...data }, requestOptions: options }
    );
  }

  /**
   * Export routes as JSON
   */
  async export(
    params: { ids?: string[] } = {},
    options?: RequestOptions
  ): Promise<unknown> {
    return this.client.request('GET', '/api/routes/export', {
      query: params.ids ? { ids: params.ids.join(',') } : undefined,
      requestOptions: options,
    });
  }

  /**
   * Import routes from JSON
   */
  async import(
    data: { routes: Partial<Route>[]; conflictStrategy?: string; validateOnly?: boolean },
    options?: RequestOptions
  ): Promise<ImportResult> {
    return this.client.request<ImportResult>('POST', '/api/routes/import', {
      body: data,
      requestOptions: options,
    });
  }

  /**
   * Get circuit breaker status for a route
   */
  async getCircuitStatus(
    routeId: string,
    options?: RequestOptions
  ): Promise<CircuitStatusInfo> {
    return this.client.request<CircuitStatusInfo>(
      'GET',
      `/api/routes/${encodeURIComponent(routeId)}/circuit-status`,
      { requestOptions: options }
    );
  }

  /**
   * Reset (close) the circuit breaker for a route
   */
  async resetCircuit(
    routeId: string,
    options?: RequestOptions
  ): Promise<{ success: boolean; circuitState: string; previousState: string }> {
    return this.client.request(
      'POST',
      `/api/routes/${encodeURIComponent(routeId)}/reset-circuit`,
      { requestOptions: options }
    );
  }

  /**
   * Update circuit breaker configuration for a route
   */
  async updateCircuitConfig(
    routeId: string,
    config: CircuitBreakerConfig,
    options?: RequestOptions
  ): Promise<void> {
    await this.client.request(
      'PATCH',
      `/api/routes/${encodeURIComponent(routeId)}/circuit-config`,
      { body: config, requestOptions: options }
    );
  }
}
