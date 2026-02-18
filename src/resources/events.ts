import { BaseResource, type ApiClient } from './base';
import type {
  InboundEvent,
  EventDetail,
  EventDebugInfo,
  ListEventsParams,
  ExportEventsParams,
  PaginatedResponse,
  RequestOptions,
} from '../types';

/**
 * Events resource for viewing inbound webhook events
 */
export class EventsResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List events with offset-based pagination
   */
  async list(
    params: ListEventsParams = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<InboundEvent>> {
    const response = await this.client.request<{
      events: InboundEvent[];
      total: number;
      limit: number;
      offset: number;
    }>('GET', '/api/events', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
    const limit = response.limit;
    const offset = response.offset;
    return {
      data: response.events,
      total: response.total,
      limit,
      offset,
      hasMore: offset + limit < response.total,
    };
  }

  /**
   * Async iterator to paginate through all events
   */
  async *listAll(
    params: Omit<ListEventsParams, 'offset'> = {},
    options?: RequestOptions
  ): AsyncGenerator<InboundEvent> {
    const limit = params.limit ?? 50;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await this.list({ ...params, limit, offset }, options);
      for (const item of response.data) {
        yield item;
      }
      hasMore = response.hasMore;
      offset += limit;
    }
  }

  /**
   * Get event detail including payload and deliveries
   */
  async get(eventId: string, options?: RequestOptions): Promise<EventDetail> {
    const response = await this.client.request<{
      event: EventDetail;
      deliveries: EventDetail['deliveries'];
    }>('GET', `/api/events/${encodeURIComponent(eventId)}`, {
      requestOptions: options,
    });
    return {
      ...response.event,
      deliveries: response.deliveries ?? [],
    };
  }

  /**
   * Get debug info for an event including curl command
   */
  async debug(eventId: string, options?: RequestOptions): Promise<EventDebugInfo> {
    return this.client.request<EventDebugInfo>(
      'GET',
      `/api/events/${encodeURIComponent(eventId)}/debug`,
      { requestOptions: options }
    );
  }

  /**
   * Export events as JSON or CSV
   */
  async export(
    params: ExportEventsParams = {},
    options?: RequestOptions
  ): Promise<unknown> {
    return this.client.request('GET', '/api/events/export', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
  }
}
