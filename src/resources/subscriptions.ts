import { BaseResource, type ApiClient } from './base';
import type {
  Subscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  ListSubscriptionsParams,
  CursorPaginatedResponse,
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
   * List subscriptions, optionally filtered by endpoint/event type, one page at a time. Pass the
   * returned `cursor` back in as `{ cursor }` for the next page.
   */
  async list(
    applicationId: string,
    params: Omit<ListSubscriptionsParams, 'applicationId'> = {},
    options?: RequestOptions
  ): Promise<CursorPaginatedResponse<Subscription>> {
    return this.listPage<Subscription>(
      '/api/webhook-subscriptions',
      { ...this.buildQuery(params), applicationId },
      options
    );
  }

  /**
   * Create an async iterator to paginate through all subscriptions
   */
  async *listAll(
    applicationId: string,
    params: Omit<ListSubscriptionsParams, 'applicationId' | 'offset'> = {},
    options?: RequestOptions
  ): AsyncGenerator<Subscription> {
    yield* this.iterate<Subscription>(
      '/api/webhook-subscriptions',
      { ...this.buildQuery(params), applicationId, limit: params.limit ?? 100 },
      options
    );
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
    // When every event type was already subscribed the API answers `{ created: 0, skipped }`
    // with no `subscriptions` key at all.
    return response.subscriptions ?? [];
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
    const response = await this.client.request<{
      created: number;
      skipped: number;
      subscriptions?: Subscription[];
    }>(
      'POST',
      '/api/webhook-subscriptions/bulk',
      {
        body: { endpointId, eventTypeIds },
        requestOptions: options,
      }
    );
    return { ...response, subscriptions: response.subscriptions ?? [] };
  }

  /**
   * Unsubscribe an endpoint from all event types
   */
  async unsubscribeAll(
    applicationId: string,
    endpointId: string,
    options?: RequestOptions
  ): Promise<void> {
    // Every page, not just the first: an endpoint with more than one page of subscriptions
    // used to keep everything past page one.
    const subs: Subscription[] = [];
    for await (const sub of this.listAll(applicationId, { endpointId }, options)) {
      subs.push(sub);
    }

    await Promise.all(
      subs.map((sub) =>
        this.delete(applicationId, sub.id, options)
      )
    );
  }
}
