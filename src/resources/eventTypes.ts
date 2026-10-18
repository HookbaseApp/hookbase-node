import { BaseResource, type ApiClient } from './base';
import type {
  EventType,
  CreateEventTypeInput,
  UpdateEventTypeInput,
  ListEventTypesParams,
  CursorPaginatedResponse,
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
   * List event types, one page at a time. Pass the returned `cursor` back in as `{ cursor }` for
   * the next page.
   */
  async list(
    params: ListEventTypesParams = {},
    options?: RequestOptions
  ): Promise<CursorPaginatedResponse<EventType>> {
    return this.listPage<EventType>('/api/event-types', this.buildQuery(params), options);
  }

  /**
   * Create an async iterator to paginate through all event types
   */
  async *listAll(
    params: Omit<ListEventTypesParams, 'offset'> = {},
    options?: RequestOptions
  ): AsyncGenerator<EventType> {
    yield* this.iterate<EventType>(
      '/api/event-types',
      { ...this.buildQuery(params), limit: params.limit ?? 100 },
      options
    );
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
   * Get an event type by its exact name.
   *
   * `search` is a substring match, so `order` also matches `order.created`, `order.updated` and
   * so on; the exact name can be on any page of those results, not just the first.
   */
  async getByName(name: string, options?: RequestOptions): Promise<EventType> {
    for await (const et of this.listAll({ search: name, limit: 100 }, options)) {
      if (et.name === name) return et;
    }
    const { HookbaseNotFoundError } = await import('../errors');
    throw new HookbaseNotFoundError(`Event type '${name}' not found`);
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
