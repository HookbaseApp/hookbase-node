import type { RequestOptions } from '../types';

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
}
