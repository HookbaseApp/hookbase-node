import { randomUUID } from 'node:crypto';
import { BaseResource, type ApiClient } from './base';
import { withAttemptAliases, withOutboundMessageAliases } from './wire';
import type {
  OutboundMessage,
  MessageAttempt,
  MessageReplayResult,
  SendMessageInput,
  SendMessageResponse,
  ListMessagesParams,
  ListOutboundMessagesParams,
  OutboundStatsSummary,
  ExportOutboundParams,
  OutboundExport,
  CursorPaginatedResponse,
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
   * Send a webhook event to subscribed endpoints (or to `endpointIds` only).
   *
   * Every call carries an idempotency key — `data.idempotencyKey`, else
   * `options.idempotencyKey`, else one generated for this call — in the body and the
   * `Idempotency-Key` header, so the client's own retries after a timeout or 5xx return the first
   * send's result instead of sending the event again.
   */
  async send(
    applicationId: string,
    data: SendMessageInput,
    options?: RequestOptions
  ): Promise<SendMessageResponse> {
    const { eventId: _ignored, endpointIds, endpointId, ...rest } = data;
    void _ignored;
    const idempotencyKey = data.idempotencyKey ?? options?.idempotencyKey ?? randomUUID();

    const body: Record<string, unknown> = { ...rest, applicationId, idempotencyKey };
    const targets = [...new Set([...(endpointIds ?? []), ...(endpointId ? [endpointId] : [])])];
    if (targets.length > 0) {
      body.endpointIds = targets;
      // The API before endpointIds support reads only the singular field; with exactly one
      // target, send it there too so the event is not fanned out to every subscriber.
      if (targets.length === 1) body.endpointId = targets[0];
    }

    const response = await this.client.request<ApiResponse<{
      eventId: string;
      messagesQueued: number;
      endpoints: Array<{ id: string; url: string }>;
    }>>(
      'POST',
      '/api/send-event',
      {
        body,
        requestOptions: { ...options, idempotencyKey },
      }
    );
    const apiData = response.data;
    const endpoints = apiData.endpoints ?? [];
    return {
      eventId: apiData.eventId,
      messagesQueued: apiData.messagesQueued ?? endpoints.length,
      endpoints,
      messageId: apiData.eventId,
      outboundMessages: endpoints.map((ep) => ({
        id: ep.id,
        endpointId: ep.id,
        status: 'pending' as const,
      })),
    };
  }

  /**
   * List outbound messages for an application, one page at a time. Pass the returned `cursor`
   * back in as `{ cursor }` for the next page.
   */
  async list(
    applicationId: string,
    params: Omit<ListMessagesParams, 'applicationId'> | ListOutboundMessagesParams = {},
    options?: RequestOptions
  ): Promise<CursorPaginatedResponse<OutboundMessage>> {
    return this.listPage<OutboundMessage>(
      '/api/outbound-messages',
      { ...this.buildQuery(params), applicationId },
      options,
      withOutboundMessageAliases
    );
  }

  /**
   * Create an async iterator to paginate through all messages
   */
  async *listAll(
    applicationId: string,
    params: Omit<ListMessagesParams, 'applicationId' | 'offset'> = {},
    options?: RequestOptions
  ): AsyncGenerator<OutboundMessage> {
    yield* this.iterate<OutboundMessage>(
      '/api/outbound-messages',
      { ...this.buildQuery(params), applicationId, limit: params.limit ?? 100 },
      options,
      withOutboundMessageAliases
    );
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
      `/api/outbound-messages/${encodeURIComponent(messageId)}`,
      { requestOptions: options }
    );
    return withOutboundMessageAliases(response.data);
  }

  /**
   * List outbound messages for an application.
   *
   * The message list has no event filter, so `messageId` does not narrow the result: this is
   * `list(applicationId, params)`.
   */
  async listOutbound(
    applicationId: string,
    messageId: string,
    params: Omit<ListOutboundMessagesParams, 'messageId'> = {},
    options?: RequestOptions
  ): Promise<CursorPaginatedResponse<OutboundMessage>> {
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
  ): Promise<CursorPaginatedResponse<OutboundMessage>> {
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
      `/api/outbound-messages/${encodeURIComponent(outboundMessageId)}/attempts`,
      { requestOptions: options }
    );
    return (response.data ?? []).map(withAttemptAliases);
  }

  /**
   * Replay an exhausted, DLQ or stalled failed outbound message. The replay is a NEW outbound
   * message: its id is `newMessageId` (also returned as `id`).
   *
   * Not retried automatically on a timeout or 5xx unless you pass `idempotencyKey`, since a
   * replay that did go through would otherwise be delivered twice.
   */
  async retry(
    applicationId: string,
    outboundMessageId: string,
    options?: RequestOptions
  ): Promise<OutboundMessage & MessageReplayResult> {
    const response = await this.client.request<ApiResponse<MessageReplayResult>>(
      'POST',
      `/api/outbound-messages/${encodeURIComponent(outboundMessageId)}/replay`,
      { requestOptions: options }
    );
    // A minimal outbound-message shape, kept for callers that read `id`/`status`, plus the
    // replay result the API actually returns.
    return {
      id: response.data.newMessageId,
      messageId: response.data.originalMessageId,
      originalMessageId: response.data.originalMessageId,
      newMessageId: response.data.newMessageId,
      status: 'pending',
    } as OutboundMessage & MessageReplayResult;
  }

  /**
   * Resend a message (alias for retry)
   */
  async resend(
    applicationId: string,
    messageId: string,
    options?: RequestOptions
  ): Promise<Pick<SendMessageResponse, 'messageId' | 'outboundMessages'> & MessageReplayResult> {
    const response = await this.client.request<ApiResponse<MessageReplayResult>>(
      'POST',
      `/api/outbound-messages/${encodeURIComponent(messageId)}/replay`,
      { requestOptions: options }
    );
    return {
      ...response.data,
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
   * Export outbound events (default) or messages. Resolves to the parsed JSON export, or to the
   * CSV text when `format: 'csv'`.
   */
  async export(
    params: ExportOutboundParams & { format: 'csv' },
    options?: RequestOptions
  ): Promise<string>;
  async export(
    params?: ExportOutboundParams & { format?: 'json' },
    options?: RequestOptions
  ): Promise<OutboundExport>;
  async export(
    params?: ExportOutboundParams,
    options?: RequestOptions
  ): Promise<OutboundExport | string>;
  async export(
    params: ExportOutboundParams = {},
    options?: RequestOptions
  ): Promise<OutboundExport | string> {
    return this.client.request<OutboundExport | string>('GET', '/api/outbound-messages/export', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
  }
}
