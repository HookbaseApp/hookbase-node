import { BaseResource, type ApiClient } from './base';
import type {
  Source,
  SourceWithSecret,
  CreateSourceInput,
  UpdateSourceInput,
  ListSourcesParams,
  PaginatedResponse,
  RequestOptions,
  ImportParams,
  ImportResult,
} from '../types';

/**
 * Sources resource for managing inbound webhook sources
 */
export class SourcesResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List all sources with page-based pagination
   */
  async list(
    params: ListSourcesParams = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<Source>> {
    const response = await this.client.request<{
      sources: Source[];
      pagination: { total: number; page: number; pageSize: number };
    }>('GET', '/api/sources', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    return {
      data: response.sources,
      total: response.pagination.total,
      limit: response.pagination.pageSize,
      offset: (response.pagination.page - 1) * response.pagination.pageSize,
      hasMore: response.pagination.page * response.pagination.pageSize < response.pagination.total,
    };
  }

  /**
   * Async iterator to paginate through all sources
   */
  async *listAll(
    params: Omit<ListSourcesParams, 'page'> = {},
    options?: RequestOptions
  ): AsyncGenerator<Source> {
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
   * Get a source by ID or slug
   */
  async get(id: string, options?: RequestOptions): Promise<Source> {
    const response = await this.client.request<{
      source: Source;
    }>('GET', `/api/sources/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
    return response.source;
  }

  /**
   * Create a new source
   */
  async create(
    data: CreateSourceInput,
    options?: RequestOptions
  ): Promise<SourceWithSecret> {
    const response = await this.client.request<{
      source: SourceWithSecret;
    }>('POST', '/api/sources', {
      body: data,
      requestOptions: options,
    });
    return response.source;
  }

  /**
   * Update a source
   */
  async update(
    id: string,
    data: UpdateSourceInput,
    options?: RequestOptions
  ): Promise<void> {
    await this.client.request('PATCH', `/api/sources/${encodeURIComponent(id)}`, {
      body: data,
      requestOptions: options,
    });
  }

  /**
   * Delete a source
   */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this.client.request('DELETE', `/api/sources/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
  }

  /**
   * Rotate the signing secret for a source
   */
  async rotateSecret(
    id: string,
    options?: RequestOptions
  ): Promise<{ signingSecret: string }> {
    return this.client.request<{ signingSecret: string }>(
      'POST',
      `/api/sources/${encodeURIComponent(id)}/rotate-secret`,
      { requestOptions: options }
    );
  }

  /**
   * Reveal the signing secret for a source
   */
  async revealSecret(
    id: string,
    options?: RequestOptions
  ): Promise<{ signingSecret: string }> {
    return this.client.request<{ signingSecret: string }>(
      'GET',
      `/api/sources/${encodeURIComponent(id)}/reveal-secret`,
      { requestOptions: options }
    );
  }

  /**
   * Export sources as JSON
   */
  async export(
    params: { ids?: string[] } = {},
    options?: RequestOptions
  ): Promise<unknown> {
    return this.client.request('GET', '/api/sources/export', {
      query: params.ids ? { ids: params.ids.join(',') } : undefined,
      requestOptions: options,
    });
  }

  /**
   * Import sources from JSON
   */
  async import(
    data: { sources: Partial<Source>[]; conflictStrategy?: string; validateOnly?: boolean },
    options?: RequestOptions
  ): Promise<ImportResult> {
    return this.client.request<ImportResult>('POST', '/api/sources/import', {
      body: data,
      requestOptions: options,
    });
  }

  /**
   * Bulk delete sources
   */
  async bulkDelete(
    ids: string[],
    options?: RequestOptions
  ): Promise<{ success: boolean; deleted: number }> {
    return this.client.request<{ success: boolean; deleted: number }>(
      'DELETE',
      '/api/sources/bulk',
      { body: { ids }, requestOptions: options }
    );
  }
}
