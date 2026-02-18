import { BaseResource, type ApiClient } from './base';
import type {
  Delivery,
  DeliveryDetail,
  ListDeliveriesParams,
  ReplayResult,
  BulkReplayResult,
  PaginatedResponse,
  RequestOptions,
} from '../types';

/**
 * Deliveries resource for viewing and replaying inbound webhook deliveries
 */
export class DeliveriesResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List deliveries with offset-based pagination
   */
  async list(
    params: ListDeliveriesParams = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<Delivery>> {
    const response = await this.client.request<{
      deliveries: Delivery[];
      limit: number;
      offset: number;
    }>('GET', '/api/deliveries', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
    const limit = response.limit;
    const offset = response.offset;
    return {
      data: response.deliveries,
      total: response.deliveries.length,
      limit,
      offset,
      hasMore: response.deliveries.length >= limit,
    };
  }

  /**
   * Async iterator to paginate through all deliveries
   */
  async *listAll(
    params: Omit<ListDeliveriesParams, 'offset'> = {},
    options?: RequestOptions
  ): AsyncGenerator<Delivery> {
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
   * Get a delivery by ID
   */
  async get(deliveryId: string, options?: RequestOptions): Promise<DeliveryDetail> {
    const response = await this.client.request<{
      delivery: DeliveryDetail;
    }>('GET', `/api/deliveries/${encodeURIComponent(deliveryId)}`, {
      requestOptions: options,
    });
    return response.delivery;
  }

  /**
   * Replay a single delivery
   */
  async replay(
    deliveryId: string,
    options?: RequestOptions
  ): Promise<ReplayResult> {
    return this.client.request<ReplayResult>(
      'POST',
      `/api/deliveries/${encodeURIComponent(deliveryId)}/replay`,
      { requestOptions: options }
    );
  }

  /**
   * Replay multiple deliveries (up to 100)
   */
  async bulkReplay(
    deliveryIds: string[],
    options?: RequestOptions
  ): Promise<BulkReplayResult> {
    return this.client.request<BulkReplayResult>(
      'POST',
      '/api/deliveries/bulk-replay',
      { body: { deliveryIds }, requestOptions: options }
    );
  }

  /**
   * Replay failed deliveries for specified events (up to 50 events)
   */
  async bulkReplayEvents(
    eventIds: string[],
    options?: RequestOptions
  ): Promise<BulkReplayResult> {
    return this.client.request<BulkReplayResult>(
      'POST',
      '/api/deliveries/bulk-replay-events',
      { body: { eventIds }, requestOptions: options }
    );
  }
}
