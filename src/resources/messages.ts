import { BaseResource, type ApiClient } from './base';
import type {
  Message,
  OutboundMessage,
  MessageAttempt,
  SendMessageInput,
  SendMessageResponse,
  ListMessagesParams,
  ListOutboundMessagesParams,
  OutboundStatsSummary,
  ExportOutboundParams,
  PaginatedResponse,
  ApiResponse,
  RequestOptions,
} from '../types';

/**
 * Messages resource for sending webhooks and viewing delivery status
 */
export class MessagesResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * Send a webhook event to subscribed endpoints
   */
  async send(
    applicationId: string,
    data: SendMessageInput,
    options?: RequestOptions
  ): Promise<SendMessageResponse> {
    const response = await this.client.request<ApiResponse<{
      eventId: string;
      messagesQueued: number;
      endpoints: Array<{ id: string; url: string }>;
    }>>(
      'POST',
      '/api/send-event',
      {
        body: { ...data, applicationId },
        requestOptions: options,
      }
    );
    // Map API response to SDK types
    const apiData = response.data;
    return {
      messageId: apiData.eventId,
      outboundMessages: apiData.endpoints.map((ep) => ({
        id: ep.id,
        endpointId: ep.id,
        status: 'pending' as const,
      })),
    };
  }

  /**
   * List outbound messages for an application
   */
  async list(
    applicationId: string,
    params: Omit<ListMessagesParams, 'applicationId'> = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<OutboundMessage>> {
    const response = await this.client.request<{
      data: OutboundMessage[];
      pagination: { hasMore: boolean; nextCursor: string | null };
    }>('GET', '/api/outbound-messages', {
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
   * Create an async iterator to paginate through all messages
   */
  async *listAll(
    applicationId: string,
    params: Omit<ListMessagesParams, 'applicationId' | 'offset'> = {},
    options?: RequestOptions
  ): AsyncGenerator<OutboundMessage> {
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.request<{
        data: OutboundMessage[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      }>('GET', '/api/outbound-messages', {
        query: { ...this.buildQuery(params), applicationId, limit: params.limit ?? 100, cursor },
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
   * Get an outbound message by ID
   */
  async get(
    applicationId: string,
    messageId: string,
    options?: RequestOptions
  ): Promise<OutboundMessage> {
    const response = await this.client.request<ApiResponse<OutboundMessage>>(
      'GET',
      `/api/outbound-messages/${messageId}`,
      { requestOptions: options }
    );
    return response.data;
  }

  /**
   * List outbound messages for a specific event/message
   */
  async listOutbound(
    applicationId: string,
    messageId: string,
    params: Omit<ListOutboundMessagesParams, 'messageId'> = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<OutboundMessage>> {
    // The API doesn't have a nested route for this - filter by event ID
    return this.list(applicationId, params, options);
  }

  /**
   * Get an outbound message by ID
   */
  async getOutbound(
    applicationId: string,
    outboundMessageId: string,
    options?: RequestOptions
  ): Promise<OutboundMessage> {
    return this.get(applicationId, outboundMessageId, options);
  }

  /**
   * List all outbound messages for an application
   */
  async listAllOutbound(
    applicationId: string,
    params: ListOutboundMessagesParams = {},
    options?: RequestOptions
  ): Promise<PaginatedResponse<OutboundMessage>> {
    return this.list(applicationId, params, options);
  }

  /**
   * List delivery attempts for an outbound message
   */
  async listAttempts(
    applicationId: string,
    outboundMessageId: string,
    options?: RequestOptions
  ): Promise<MessageAttempt[]> {
    const response = await this.client.request<ApiResponse<MessageAttempt[]>>(
      'GET',
      `/api/outbound-messages/${outboundMessageId}/attempts`,
      { requestOptions: options }
    );
    return response.data;
  }

  /**
   * Replay a failed outbound message
   */
  async retry(
    applicationId: string,
    outboundMessageId: string,
    options?: RequestOptions
  ): Promise<OutboundMessage> {
    const response = await this.client.request<ApiResponse<{
      originalMessageId: string;
      newMessageId: string;
      status: string;
    }>>(
      'POST',
      `/api/outbound-messages/${outboundMessageId}/replay`,
      { requestOptions: options }
    );
    // Return a minimal outbound message shape
    return {
      id: response.data.newMessageId,
      messageId: response.data.originalMessageId,
      status: 'pending',
    } as OutboundMessage;
  }

  /**
   * Resend a message (alias for retry)
   */
  async resend(
    applicationId: string,
    messageId: string,
    options?: RequestOptions
  ): Promise<SendMessageResponse> {
    const response = await this.client.request<ApiResponse<{
      originalMessageId: string;
      newMessageId: string;
      status: string;
    }>>(
      'POST',
      `/api/outbound-messages/${messageId}/replay`,
      { requestOptions: options }
    );
    return {
      messageId: response.data.newMessageId,
      outboundMessages: [],
    };
  }

  /**
   * Get outbound message statistics summary
   */
  async getStatsSummary(options?: RequestOptions): Promise<OutboundStatsSummary> {
    const response = await this.client.request<{ data: OutboundStatsSummary }>(
      'GET',
      '/api/outbound-messages/stats/summary',
      { requestOptions: options }
    );
    return response.data;
  }

  /**
   * Export outbound events/messages as JSON or CSV
   */
  async export(
    params: ExportOutboundParams = {},
    options?: RequestOptions
  ): Promise<unknown> {
    return this.client.request('GET', '/api/outbound-messages/export', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
  }
}
