import { BaseResource, type ApiClient } from './base';
import type {
  Application,
  CreateApplicationInput,
  UpdateApplicationInput,
  ListApplicationsParams,
  PaginatedResponse,
  ApiResponse,
  RequestOptions,
} from '../types';

/**
 * Applications resource for managing webhook applications
 *
 * Applications represent your customers or tenants and group their endpoints.
 */
export class ApplicationsResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List all applications
   */
  async list(
    params: ListApplicationsParams = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<Application>> {
    const response = await this.client.request<{
      data: Application[];
      pagination: { hasMore: boolean; nextCursor: string | null };
    }>('GET', '/api/webhook-applications', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
    return {
      data: response.data,
      total: response.data.length,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
      hasMore: response.pagination?.hasMore ?? false,
    };
  }

  /**
   * Create an async iterator to paginate through all applications
   */
  async *listAll(
    params: Omit<ListApplicationsParams, 'offset'> = {},
    options?: RequestOptions
  ): AsyncGenerator<Application> {
    const limit = params.limit ?? 100;
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.request<{
        data: Application[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      }>('GET', '/api/webhook-applications', {
        query: { ...this.buildQuery(params), limit, cursor },
        requestOptions: options,
      });

      for (const item of response.data) {
        yield item;
      }

      hasMore = response.pagination?.hasMore ?? false;
      cursor = response.pagination?.nextCursor ?? undefined;
    }
  }

  /**
   * Get an application by ID
   */
  async get(id: string, options?: RequestOptions): Promise<Application> {
    const response = await this.client.request<ApiResponse<Application>>(
      'GET',
      `/api/webhook-applications/${id}`,
      { requestOptions: options }
    );
    return response.data;
  }

  /**
   * Get an application by external ID (uid)
   */
  async getByUid(uid: string, options?: RequestOptions): Promise<Application> {
    const response = await this.client.request<ApiResponse<Application>>(
      'GET',
      `/api/webhook-applications/by-external-id/${encodeURIComponent(uid)}`,
      { requestOptions: options }
    );
    return response.data;
  }

  /**
   * Create a new application
   */
  async create(
    data: CreateApplicationInput,
    options?: RequestOptions
  ): Promise<Application> {
    // Map uid → externalId for API compatibility
    const body: Record<string, unknown> = { ...data };
    if ('uid' in body) {
      body.externalId = body.uid;
      delete body.uid;
    }
    const response = await this.client.request<ApiResponse<Application>>(
      'POST',
      '/api/webhook-applications',
      { body, requestOptions: options }
    );
    return response.data;
  }

  /**
   * Update an application
   */
  async update(
    id: string,
    data: UpdateApplicationInput,
    options?: RequestOptions
  ): Promise<Application> {
    const response = await this.client.request<ApiResponse<Application>>(
      'PATCH',
      `/api/webhook-applications/${id}`,
      { body: data, requestOptions: options }
    );
    return response.data;
  }

  /**
   * Delete an application and all associated endpoints/subscriptions
   */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this.client.request('DELETE', `/api/webhook-applications/${id}`, {
      requestOptions: options,
    });
  }

  /**
   * Get or create an application by external ID (uid).
   * Uses the API's upsert endpoint.
   */
  async getOrCreate(
    uid: string,
    data: Omit<CreateApplicationInput, 'uid'>,
    options?: RequestOptions
  ): Promise<Application> {
    const response = await this.client.request<{
      data: Application;
      created: boolean;
    }>(
      'PUT',
      '/api/webhook-applications/upsert',
      {
        body: { ...data, externalId: uid },
        requestOptions: options,
      }
    );
    return response.data;
  }
}
