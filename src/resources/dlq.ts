import { BaseResource, type ApiClient } from './base';
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
    const response = await this.client.request<{
      data: DlqMessage[];
      pagination: { hasMore: boolean; nextCursor: string | null };
    }>('GET', '/api/outbound-messages/dlq/messages', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
    return {
      data: response.data,
      total: response.data.length,
      limit: params.limit ?? 50,
      offset: 0,
      hasMore: response.pagination?.hasMore ?? false,
      cursor: response.pagination?.nextCursor ?? null,
    };
  }

  /**
   * Async iterator to paginate through all DLQ messages
   */
  async *listAll(
    params: Omit<ListDlqParams, 'cursor'> = {},
    options?: RequestOptions
  ): AsyncGenerator<DlqMessage> {
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.request<{
        data: DlqMessage[];
        pagination: { hasMore: boolean; nextCursor: string | null };
      }>('GET', '/api/outbound-messages/dlq/messages', {
        query: { ...this.buildQuery(params), cursor },
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
   * Get DLQ statistics including breakdown by reason and top failing endpoints
   */
  async getStats(options?: RequestOptions): Promise<DlqStats> {
    const response = await this.client.request<{ data: DlqStats }>(
      'GET',
      '/api/outbound-messages/dlq/stats',
      { requestOptions: options }
    );
    return response.data;
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
    return response.data;
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
    return response.data;
  }
}
