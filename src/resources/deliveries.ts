import { BaseResource, type ApiClient } from './base';
import { withDeliveryAliases, withDeliveryDetailAliases } from './wire';
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
    const deliveries = (response.deliveries ?? []).map(withDeliveryAliases);
    // `limit` is the API's, which clamps the request to 100; comparing the page to it rather than
    // to what was asked for keeps a full clamped page from reading as the last one.
    const limit = response.limit;
    const offset = response.offset;
    return {
      data: deliveries,
      total: deliveries.length,
      limit,
      offset,
      hasMore: deliveries.length > 0 && deliveries.length >= limit,
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
      // Advance by the rows that came back, not by the limit asked for: the API clamps `limit`
      // to 100, so asking for 500 and stepping by 500 skipped 400 rows per page.
      offset += response.data.length;
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
    return withDeliveryDetailAliases(response.delivery);
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
