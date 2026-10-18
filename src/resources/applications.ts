import { BaseResource, type ApiClient } from './base';
import { withApplicationAliases } from './wire';
import type {
  Application,
  CreateApplicationInput,
  UpdateApplicationInput,
  ListApplicationsParams,
  CursorPaginatedResponse,
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
   * List applications, one page at a time. Pass the returned `cursor` back in as `{ cursor }`
   * for the next page.
   */
  async list(
    params: ListApplicationsParams = {},
    options?: RequestOptions
  ): Promise<CursorPaginatedResponse<Application>> {
    return this.listPage<Application>(
      '/api/webhook-applications',
      this.buildQuery(params),
      options,
      withApplicationAliases
    );
  }

  /**
   * Create an async iterator to paginate through all applications
   */
  async *listAll(
    params: Omit<ListApplicationsParams, 'offset'> = {},
    options?: RequestOptions
  ): AsyncGenerator<Application> {
    yield* this.iterate<Application>(
      '/api/webhook-applications',
      { ...this.buildQuery(params), limit: params.limit ?? 100 },
      options,
      withApplicationAliases
    );
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
    return withApplicationAliases(response.data);
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
    return withApplicationAliases(response.data);
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
    return withApplicationAliases(response.data);
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
    return withApplicationAliases(response.data);
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
    return withApplicationAliases(response.data);
  }
}
