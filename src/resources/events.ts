import { BaseResource, type ApiClient } from './base';
import { withDeliveryAliases } from './wire';
import type {
  CursorPaginatedResponse,
  Delivery,
  InboundEvent,
  EventDetail,
  EventDebugInfo,
  ListEventsParams,
  ExportEventsParams,
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
   * List events, newest first, with cursor-based pagination.
   *
   * `total` is the API's exact count when `includeTotal` is set (and `status` is not), and the
   * size of this page otherwise.
   */
  async list(
    params: ListEventsParams = {},
    options?: RequestOptions
  ): Promise<CursorPaginatedResponse<InboundEvent>> {
    // The route has no offset: it pages by keyset cursor and returns `nextCursor`. Sending an
    // offset did nothing, and `hasMore` used to be derived from a `total` the API now only sends
    // on request, so every listAll stopped after page one.
    const { offset: _offset, includeTotal, ...rest } = params;
    const query = this.buildQuery(rest);
    if (includeTotal) query.includeTotal = '1';
    const response = await this.client.request<{
      events: InboundEvent[];
      total?: number | null;
      limit: number;
      hasMore?: boolean;
      nextCursor?: string | null;
    }>('GET', '/api/events', {
      query,
      requestOptions: options,
    });
    const data = response.events ?? [];
    const cursor = response.nextCursor ?? null;
    return {
      data,
      total: response.total ?? data.length,
      limit: response.limit,
      offset: 0,
      hasMore: (response.hasMore ?? false) && cursor !== null,
      cursor,
    };
  }

  /**
   * Async iterator to paginate through all events, following the cursor until `hasMore` is false.
   * Starts from `params.cursor` when one is given.
   */
  async *listAll(
    params: Omit<ListEventsParams, 'offset'> = {},
    options?: RequestOptions
  ): AsyncGenerator<InboundEvent> {
    let cursor = params.cursor;
    for (;;) {
      const page = await this.list({ ...params, cursor }, options);
      for (const item of page.data) {
        yield item;
      }
      if (!page.hasMore || page.cursor === null) return;
      cursor = page.cursor;
    }
  }

  /**
   * Get event detail including payload and deliveries
   */
  async get(eventId: string, options?: RequestOptions): Promise<EventDetail> {
    // The API sends `{ event, payload, transient, deliveries }`. The payload is a sibling of the
    // event, not a field on it, so spreading `event` alone left `payload` undefined every time.
    const response = await this.client.request<{
      event: Omit<EventDetail, 'payload' | 'transient' | 'deliveries'>;
      payload?: unknown;
      transient?: boolean;
      deliveries?: Delivery[];
    }>('GET', `/api/events/${encodeURIComponent(eventId)}`, {
      requestOptions: options,
    });
    return {
      ...response.event,
      payload: response.payload ?? null,
      transient: response.transient ?? false,
      deliveries: (response.deliveries ?? []).map(withDeliveryAliases),
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
