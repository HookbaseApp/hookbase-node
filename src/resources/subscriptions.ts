import { BaseResource, type ApiClient } from './base';
import type {
  Subscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  ListSubscriptionsParams,
  PaginatedResponse,
  ApiResponse,
  RequestOptions,
} from '../types';

/**
 * Subscriptions resource for managing webhook subscriptions
 *
 * Subscriptions link endpoints to event types.
 */
export class SubscriptionsResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List all subscriptions, optionally filtered by application/endpoint/eventType
   */
  async list(
    applicationId: string,
    params: Omit<ListSubscriptionsParams, 'applicationId'> = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<Subscription>> {
    const response = await this.client.request<{
      data: Subscription[];
      pagination: { hasMore: boolean; nextCursor: string | null };
    }>('GET', '/api/webhook-subscriptions', {
      query: { ...this.buildQuery(params), applicationId },
      requestOptions: options,
    });
    return {
      data: response.data,
      total: response.data.length,
      limit: params.limit ?? 50,
      offset: 0,
      hasMore: response.pagination?.hasMore ?? false,
    };
  }

  /**
   * Create an async iterator to paginate through all subscriptions
   */
  async *listAll(
    applicationId: string,
    params: Omit<ListSubscriptionsParams, 'applicationId' | 'offset'> = {},
    options?: RequestOptions
  ): AsyncGenerator<Subscription> {
    const limit = params.limit ?? 100;
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.request<{
        data: Subscription[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      }>('GET', '/api/webhook-subscriptions', {
        query: { ...this.buildQuery(params), applicationId, limit, cursor },
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
   * Get a subscription by ID
   */
  async get(
    applicationId: string,
    subscriptionId: string,
    options?: RequestOptions
  ): Promise<Subscription> {
    const response = await this.client.request<ApiResponse<Subscription>>(
      'GET',
      `/api/webhook-subscriptions/${subscriptionId}`,
      { requestOptions: options }
    );
    return response.data;
  }

  /**
   * Create a new subscription
   */
  async create(
    applicationId: string,
    data: CreateSubscriptionInput,
    options?: RequestOptions
  ): Promise<Subscription> {
    const response = await this.client.request<ApiResponse<Subscription>>(
      'POST',
      '/api/webhook-subscriptions',
      { body: data, requestOptions: options }
    );
    return response.data;
  }

  /**
   * Update a subscription
   */
  async update(
    applicationId: string,
    subscriptionId: string,
    data: UpdateSubscriptionInput,
    options?: RequestOptions
  ): Promise<Subscription> {
    const response = await this.client.request<ApiResponse<Subscription>>(
      'PATCH',
      `/api/webhook-subscriptions/${subscriptionId}`,
      { body: data, requestOptions: options }
    );
    return response.data;
  }

  /**
   * Delete a subscription
   */
  async delete(
    applicationId: string,
    subscriptionId: string,
    options?: RequestOptions
  ): Promise<void> {
    await this.client.request(
      'DELETE',
      `/api/webhook-subscriptions/${subscriptionId}`,
      { requestOptions: options }
    );
  }

  /**
   * Enable a subscription
   */
  async enable(
    applicationId: string,
    subscriptionId: string,
    options?: RequestOptions
  ): Promise<Subscription> {
    return this.update(applicationId, subscriptionId, { isEnabled: true }, options);
  }

  /**
   * Disable a subscription
   */
  async disable(
    applicationId: string,
    subscriptionId: string,
    options?: RequestOptions
  ): Promise<Subscription> {
    return this.update(applicationId, subscriptionId, { isEnabled: false }, options);
  }

  /**
   * Subscribe an endpoint to multiple event types (bulk)
   */
  async subscribeToMany(
    applicationId: string,
    endpointId: string,
    eventTypeIds: string[],
    options?: RequestOptions
  ): Promise<Subscription[]> {
    const response = await this.client.request<{
      created: number;
      skipped: number;
      subscriptions: Subscription[];
    }>(
      'POST',
      '/api/webhook-subscriptions/bulk',
      {
        body: { endpointId, eventTypeIds },
        requestOptions: options,
      }
    );
    return response.subscriptions;
  }

  /**
   * Bulk subscribe an endpoint to multiple event types.
   * Returns full result including created/skipped counts.
   */
  async bulkSubscribe(
    endpointId: string,
    eventTypeIds: string[],
    options?: RequestOptions
  ): Promise<{ created: number; skipped: number; subscriptions: Subscription[] }> {
    return this.client.request<{
      created: number;
      skipped: number;
      subscriptions: Subscription[];
    }>(
      'POST',
      '/api/webhook-subscriptions/bulk',
      {
        body: { endpointId, eventTypeIds },
        requestOptions: options,
      }
    );
  }

  /**
   * Unsubscribe an endpoint from all event types
   */
  async unsubscribeAll(
    applicationId: string,
    endpointId: string,
    options?: RequestOptions
  ): Promise<void> {
    const subs = await this.list(applicationId, { endpointId }, options);

    await Promise.all(
      subs.data.map((sub) =>
        this.delete(applicationId, sub.id, options)
      )
    );
  }
}
