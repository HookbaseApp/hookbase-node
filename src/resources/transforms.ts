import { BaseResource, type ApiClient } from './base';
import type {
  Transform,
  CreateTransformInput,
  UpdateTransformInput,
  ListTransformsParams,
  TransformTestInput,
  TransformTestResult,
  PaginatedResponse,
  RequestOptions,
} from '../types';

/**
 * Transforms resource for managing webhook payload transformations
 */
export class TransformsResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List all transforms with page-based pagination
   */
  async list(
    params: ListTransformsParams = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<Transform>> {
    const response = await this.client.request<{
      transforms: Transform[];
      pagination: { total: number; page: number; pageSize: number };
    }>('GET', '/api/transforms', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
    return {
      data: response.transforms,
      total: response.pagination.total,
      limit: response.pagination.pageSize,
      offset: (response.pagination.page - 1) * response.pagination.pageSize,
      hasMore: response.pagination.page * response.pagination.pageSize < response.pagination.total,
    };
  }

  /**
   * Async iterator to paginate through all transforms
   */
  async *listAll(
    params: Omit<ListTransformsParams, 'page'> = {},
    options?: RequestOptions
  ): AsyncGenerator<Transform> {
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
   * Get a transform by ID
   */
  async get(id: string, options?: RequestOptions): Promise<Transform> {
    const response = await this.client.request<{
      transform: Transform;
    }>('GET', `/api/transforms/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
    return response.transform;
  }

  /**
   * Create a new transform
   */
  async create(
    data: CreateTransformInput,
    options?: RequestOptions
  ): Promise<Transform> {
    const response = await this.client.request<{
      transform: Transform;
    }>('POST', '/api/transforms', {
      body: data,
      requestOptions: options,
    });
    return response.transform;
  }

  /**
   * Update a transform
   */
  async update(
    id: string,
    data: UpdateTransformInput,
    options?: RequestOptions
  ): Promise<void> {
    await this.client.request('PATCH', `/api/transforms/${encodeURIComponent(id)}`, {
      body: data,
      requestOptions: options,
    });
  }

  /**
   * Delete a transform
   */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this.client.request('DELETE', `/api/transforms/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
  }

  /**
   * Test a transform against a sample payload
   */
  async test(
    data: TransformTestInput,
    options?: RequestOptions
  ): Promise<TransformTestResult> {
    return this.client.request<TransformTestResult>(
      'POST',
      '/api/transforms/test',
      { body: data, requestOptions: options }
    );
  }
}
