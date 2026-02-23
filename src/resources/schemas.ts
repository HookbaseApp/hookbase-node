import { BaseResource, type ApiClient } from './base';
import type {
  Schema,
  CreateSchemaInput,
  UpdateSchemaInput,
  ListSchemasParams,
  SchemaValidationResult,
  PaginatedResponse,
  RequestOptions,
} from '../types';

/**
 * Schemas resource for managing webhook payload validation schemas
 */
export class SchemasResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List all schemas
   */
  async list(
    params: ListSchemasParams = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<Schema>> {
    const response = await this.client.request<{
      schemas: Schema[];
    }>('GET', '/api/schemas', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
    return {
      data: response.schemas,
      total: response.schemas.length,
      limit: params.pageSize ?? 50,
      offset: 0,
      hasMore: false,
    };
  }

  /**
   * Get a schema by ID (includes associated routes)
   */
  async get(id: string, options?: RequestOptions): Promise<Schema> {
    const response = await this.client.request<{
      schema: Schema;
    }>('GET', `/api/schemas/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
    return response.schema;
  }

  /**
   * Create a new schema
   */
  async create(
    data: CreateSchemaInput,
    options?: RequestOptions
  ): Promise<Schema> {
    const response = await this.client.request<{
      schema: Schema;
    }>('POST', '/api/schemas', {
      body: data,
      requestOptions: options,
    });
    return response.schema;
  }

  /**
   * Update a schema
   */
  async update(
    id: string,
    data: UpdateSchemaInput,
    options?: RequestOptions
  ): Promise<void> {
    await this.client.request('PUT', `/api/schemas/${encodeURIComponent(id)}`, {
      body: data,
      requestOptions: options,
    });
  }

  /**
   * Delete a schema
   */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this.client.request('DELETE', `/api/schemas/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
  }

  /**
   * Validate a payload against a schema
   */
  async validate(
    id: string,
    payload: unknown,
    options?: RequestOptions
  ): Promise<SchemaValidationResult> {
    return this.client.request<SchemaValidationResult>(
      'POST',
      `/api/schemas/${encodeURIComponent(id)}/validate`,
      { body: { payload }, requestOptions: options }
    );
  }
}
