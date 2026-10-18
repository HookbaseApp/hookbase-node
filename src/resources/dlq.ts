import { BaseResource, type ApiClient } from './base';
import {
  withDlqBulkDeleteAliases,
  withDlqBulkRetryAliases,
  withDlqMessageAliases,
  withDlqStatsAliases,
} from './wire';
import type {
  DlqMessage,
  DlqStats,
  DlqRetryResult,
  DlqBulkRetryResult,
  DlqBulkDeleteResult,
  ListDlqParams,
  CursorPaginatedResponse,
  RequestOptions,
} from '../types';

/**
 * DLQ (Dead Letter Queue) resource for managing failed outbound messages
 */
export class DlqResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List DLQ messages with cursor-based pagination. Pass the returned `cursor` back in as
   * `{ cursor }` to fetch the next page — it was previously read off the response and then
   * dropped, so there was no way for a caller to ask for page two without using `listAll()`.
   */
  async list(
    params: ListDlqParams = {},
    options?: RequestOptions
  ): Promise<CursorPaginatedResponse<DlqMessage>> {
    return this.listPage<DlqMessage>(
      '/api/outbound-messages/dlq/messages',
      this.dlqQuery(params),
      options,
      withDlqMessageAliases
    );
  }

  /**
   * Async iterator to paginate through all DLQ messages
   */
  async *listAll(
    params: Omit<ListDlqParams, 'cursor'> = {},
    options?: RequestOptions
  ): AsyncGenerator<DlqMessage> {
    yield* this.iterate<DlqMessage>(
      '/api/outbound-messages/dlq/messages',
      this.dlqQuery(params),
      options,
      withDlqMessageAliases
    );
  }

  /** The API reads the reason filter as `reason`; `dlqReason` was silently ignored. */
  private dlqQuery(params: ListDlqParams): Record<string, string | number | boolean | undefined> {
    const { dlqReason, reason, ...rest } = params;
    return { ...this.buildQuery(rest), reason: reason ?? dlqReason };
  }

  /**
   * Get DLQ statistics: totals by reason, and the top endpoints and event types
   */
  async getStats(options?: RequestOptions): Promise<DlqStats> {
    const response = await this.client.request<{ data: DlqStats }>(
      'GET',
      '/api/outbound-messages/dlq/stats',
      { requestOptions: options }
    );
    return withDlqStatsAliases(response.data);
  }

  /**
   * Retry a single DLQ message
   */
  async retry(
    id: string,
    options?: RequestOptions
  ): Promise<DlqRetryResult> {
    const response = await this.client.request<{ data: DlqRetryResult }>(
      'POST',
      `/api/outbound-messages/dlq/${encodeURIComponent(id)}/retry`,
      { requestOptions: options }
    );
    return response.data;
  }

  /**
   * Retry multiple DLQ messages (up to 100)
   */
  async retryBulk(
    messageIds: string[],
    options?: RequestOptions
  ): Promise<DlqBulkRetryResult> {
    const response = await this.client.request<{ data: DlqBulkRetryResult }>(
      'POST',
      '/api/outbound-messages/dlq/retry-bulk',
      { body: { messageIds }, requestOptions: options }
    );
    return withDlqBulkRetryAliases(response.data);
  }

  /**
   * Delete a single DLQ message
   */
  async delete(
    id: string,
    options?: RequestOptions
  ): Promise<void> {
    await this.client.request(
      'DELETE',
      `/api/outbound-messages/dlq/${encodeURIComponent(id)}`,
      { requestOptions: options }
    );
  }

  /**
   * Delete multiple DLQ messages (up to 100)
   */
  async deleteBulk(
    messageIds: string[],
    options?: RequestOptions
  ): Promise<DlqBulkDeleteResult> {
    const response = await this.client.request<{ data: DlqBulkDeleteResult }>(
      'DELETE',
      '/api/outbound-messages/dlq/bulk',
      { body: { messageIds }, requestOptions: options }
    );
    return withDlqBulkDeleteAliases(response.data);
  }
}
