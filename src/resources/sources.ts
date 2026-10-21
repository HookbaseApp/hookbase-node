import { BaseResource, type ApiClient } from './base';
import { importBody } from './wire';
import type {
  Source,
  SourceWithSecret,
  PendingVerification,
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
   * Replace the signing secret with a new Hookbase-generated one.
   *
   * Only for providers whose secret Hookbase generates (catalog `secretSource` `operator` or
   * `none`). The API answers 400 when there is nothing it can generate: providers that verify
   * without a secret (`wise`, `aws-sns`), public-key providers (`discord`, `sendgrid`...),
   * vendor-issued secrets (`stripe`, `standard-webhooks`...) and secrets issued after
   * registration (`asana`, `notion`). Rotate those at the vendor, then `update()` the source.
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
   * Reveal the signing secret for a source. 404 when it has none set.
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
   * Reveal the Meta verify token (`whatsapp` sources only; 400 for any other provider)
   */
  async verifyToken(
    id: string,
    options?: RequestOptions
  ): Promise<{ verifyToken: string }> {
    return this.client.request<{ verifyToken: string }>(
      'GET',
      `/api/sources/${encodeURIComponent(id)}/verify-token`,
      { requestOptions: options }
    );
  }

  /**
   * Generate a new Meta verify token. Update it in Meta's webhook setup afterwards.
   */
  async rotateVerifyToken(
    id: string,
    options?: RequestOptions
  ): Promise<{ verifyToken: string }> {
    return this.client.request<{ verifyToken: string }>(
      'POST',
      `/api/sources/${encodeURIComponent(id)}/rotate-verify-token`,
      { requestOptions: options }
    );
  }

  /**
   * The verification token a vendor (Notion) posted to the ingest URL, awaiting adoption.
   *
   * Throws `HookbaseNotFoundError` when none is waiting (they expire after 24 hours) as well as
   * when the source does not exist.
   */
  async getPendingVerification(
    id: string,
    options?: RequestOptions
  ): Promise<PendingVerification> {
    return this.client.request<PendingVerification>(
      'GET',
      `/api/sources/${encodeURIComponent(id)}/pending-verification`,
      { requestOptions: options }
    );
  }

  /**
   * Make the pending verification token this source's signing secret.
   *
   * Do this only after the vendor has accepted the token (Notion's Verify form): it arrived
   * unauthenticated, and that acceptance is what proves it genuine. 404 when none is waiting.
   */
  async adoptPendingVerification(
    id: string,
    options?: RequestOptions
  ): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>(
      'POST',
      `/api/sources/${encodeURIComponent(id)}/pending-verification/adopt`,
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
      body: importBody(data),
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
