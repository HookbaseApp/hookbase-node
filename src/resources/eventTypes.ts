import { BaseResource, type ApiClient } from './base';
import type {
  EventType,
  CreateEventTypeInput,
  UpdateEventTypeInput,
  ListEventTypesParams,
  PaginatedResponse,
  ApiResponse,
  RequestOptions,
} from '../types';

/**
 * Event Types resource for managing webhook event types
 */
export class EventTypesResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List all event types
   */
  async list(
    params: ListEventTypesParams = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<EventType>> {
    const response = await this.client.request<{
      data: EventType[];
      pagination: { hasMore: boolean; nextCursor: string | null };
    }>('GET', '/api/event-types', {
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
   * Create an async iterator to paginate through all event types
   */
  async *listAll(
    params: Omit<ListEventTypesParams, 'offset'> = {},
    options?: RequestOptions
  ): AsyncGenerator<EventType> {
    const limit = params.limit ?? 100;
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.request<{
        data: EventType[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      }>('GET', '/api/event-types', {
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
   * Get an event type by ID
   */
  async get(id: string, options?: RequestOptions): Promise<EventType> {
    const response = await this.client.request<ApiResponse<EventType>>(
      'GET',
      `/api/event-types/${id}`,
      { requestOptions: options }
    );
    return response.data;
  }

  /**
   * Get an event type by name (searches and returns first match)
   */
  async getByName(name: string, options?: RequestOptions): Promise<EventType> {
    const response = await this.client.request<{
      data: EventType[];
    }>('GET', '/api/event-types', {
      query: { search: name, limit: 100 },
      requestOptions: options,
    });
    const match = response.data.find((et) => et.name === name);
    if (!match) {
      const { HookbaseNotFoundError } = await import('../errors');
      throw new HookbaseNotFoundError(`Event type '${name}' not found`);
    }
    return match;
  }

  /**
   * Create a new event type
   */
  async create(
    data: CreateEventTypeInput,
    options?: RequestOptions
  ): Promise<EventType> {
    const body: Record<string, unknown> = { ...data };
    // API expects schema and examplePayload as JSON strings
    if (body.schema && typeof body.schema === 'object') {
      body.schema = JSON.stringify(body.schema);
    }
    if (body.examplePayload && typeof body.examplePayload === 'object') {
      body.examplePayload = JSON.stringify(body.examplePayload);
    }
    const response = await this.client.request<ApiResponse<EventType>>(
      'POST',
      '/api/event-types',
      { body, requestOptions: options }
    );
    return response.data;
  }

  /**
   * Update an event type
   */
  async update(
    id: string,
    data: UpdateEventTypeInput,
    options?: RequestOptions
  ): Promise<EventType> {
    const body: Record<string, unknown> = { ...data };
    if (body.schema && typeof body.schema === 'object') {
      body.schema = JSON.stringify(body.schema);
    }
    if (body.examplePayload && typeof body.examplePayload === 'object') {
      body.examplePayload = JSON.stringify(body.examplePayload);
    }
    const response = await this.client.request<ApiResponse<EventType>>(
      'PATCH',
      `/api/event-types/${id}`,
      { body, requestOptions: options }
    );
    return response.data;
  }

  /**
   * Delete an event type
   */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this.client.request('DELETE', `/api/event-types/${id}`, {
      requestOptions: options,
    });
  }

  /**
   * Archive an event type
   */
  async archive(id: string, options?: RequestOptions): Promise<EventType> {
    return this.update(id, { isEnabled: false }, options);
  }

  /**
   * Unarchive an event type
   */
  async unarchive(id: string, options?: RequestOptions): Promise<EventType> {
    return this.update(id, { isEnabled: true }, options);
  }

  /**
   * Get or create an event type by name
   */
  async getOrCreate(
    name: string,
    data: Omit<CreateEventTypeInput, 'name'>,
    options?: RequestOptions
  ): Promise<EventType> {
    try {
      return await this.getByName(name, options);
    } catch (error: unknown) {
      const { HookbaseNotFoundError } = await import('../errors');
      if (error instanceof HookbaseNotFoundError) {
        return await this.create({ ...data, name }, options);
      }
      throw error;
    }
  }
}
