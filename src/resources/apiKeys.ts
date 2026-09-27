import { BaseResource, type ApiClient } from './base';
import { createApiKeyBody } from './wire';
import type { RequestOptions } from '../types';

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  [key: string]: unknown;
}

export interface ApiKeyWithSecret extends ApiKey {
  key: string;
}

export interface CreateApiKeyInput {
  name: string;
  /** Permissions for the key: `read`, `write`, `delete` (default: `['read', 'write']`) */
  scopes?: string[];
  /**
   * Days until the key expires (default: never). Converted to the `expiresIn` seconds the API
   * reads; see `createApiKeyBody` in `./wire`.
   */
  expiresInDays?: number;
}

/**
 * API Keys resource for managing API keys
 */
export class ApiKeysResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List all API keys
   */
  async list(options?: RequestOptions): Promise<ApiKey[]> {
    const response = await this.client.request<{
      apiKeys?: ApiKey[];
      data?: ApiKey[];
    }>('GET', '/api/api-keys', { requestOptions: options });
    return response.apiKeys ?? response.data ?? [];
  }

  /**
   * Create a new API key
   */
  async create(
    data: CreateApiKeyInput,
    options?: RequestOptions
  ): Promise<ApiKeyWithSecret> {
    const response = await this.client.request<{
      data?: ApiKeyWithSecret;
      apiKey?: ApiKeyWithSecret;
    }>('POST', '/api/api-keys', {
      body: createApiKeyBody(data),
      requestOptions: options,
    });
    return response.data ?? response.apiKey ?? (response as unknown as ApiKeyWithSecret);
  }

  /**
   * Delete an API key
   */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this.client.request('DELETE', `/api/api-keys/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
  }
}
