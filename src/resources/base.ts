import type { CursorPaginatedResponse, RequestOptions } from '../types';

export interface ApiClient {
  request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
      requestOptions?: RequestOptions;
    }
  ): Promise<T>;
}

/**
 * Base class for API resource handlers
 */
export abstract class BaseResource {
  protected client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  protected buildQuery(
    params: object
  ): Record<string, string | number | boolean | undefined> {
    const query: Record<string, string | number | boolean | undefined> = {};

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          query[key] = value;
        }
      }
    }

    return query;
  }

  /**
   * Fetch one page of a cursor-paginated list (`{ data, pagination: { hasMore, nextCursor } }`).
   *
   * The cursor is opaque: the caller's `cursor` goes out exactly as it came back from the
   * previous page. `offset` is dropped — no outbound list reads it, so sending it only made a
   * request for "page two" quietly return page one again.
   */
  protected async listPage<T>(
    path: string,
    query: Record<string, string | number | boolean | undefined>,
    options: RequestOptions | undefined,
    map: (item: T) => T = (item) => item
  ): Promise<CursorPaginatedResponse<T>> {
    const rest = { ...query };
    delete rest.offset;
    const response = await this.client.request<{
      data: T[];
      pagination?: { hasMore?: boolean; nextCursor?: string | null };
    }>('GET', path, { query: rest, requestOptions: options });
    const data = (response.data ?? []).map(map);
    const cursor = response.pagination?.nextCursor ?? null;
    return {
      data,
      total: data.length,
      limit: typeof rest.limit === 'number' ? rest.limit : 50,
      offset: 0,
      // A page that says there is more but gives no cursor to fetch it with is the last page we
      // can reach; reporting hasMore there sent loops round page one forever.
      hasMore: (response.pagination?.hasMore ?? false) && cursor !== null,
      cursor,
    };
  }

  /**
   * Yield every item of a cursor-paginated list, following `nextCursor` until `hasMore` is false.
   * Starts from `query.cursor` when one is given.
   */
  protected async *iterate<T>(
    path: string,
    query: Record<string, string | number | boolean | undefined>,
    options: RequestOptions | undefined,
    map?: (item: T) => T
  ): AsyncGenerator<T> {
    let cursor = typeof query.cursor === 'string' ? query.cursor : undefined;
    for (;;) {
      const page: CursorPaginatedResponse<T> = await this.listPage<T>(
        path,
        { ...query, cursor },
        options,
        map
      );
      for (const item of page.data) {
        yield item;
      }
      if (!page.hasMore || page.cursor === null) return;
      cursor = page.cursor;
    }
  }
}
