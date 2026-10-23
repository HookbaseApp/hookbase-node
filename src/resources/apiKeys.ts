import { BaseResource, type ApiClient } from './base';
import { createApiKeyBody } from './wire';
import type { RequestOptions } from '../types';

export interface ApiKey {
  id: string;
  name: string;
  /** The first characters of the key (`whr_...`), for telling keys apart. */
  keyPrefix: string;
  /** @deprecated The API calls this `keyPrefix`; the SDK mirrors it here. */
  prefix: string;
  scopes: string[];
  /** Absent on the create response. */
  lastUsedAt?: string | null;
  expiresAt: string | null;
  /** Absent on the create response. */
  createdAt?: string;
  [key: string]: unknown;
}

export interface ApiKeyWithSecret extends ApiKey {
  /** The full key, shown once. */
  key: string;
}

/** `keyPrefix` with the old `prefix` mirror, and `scopes` parsed (the list sends it as a JSON string). */
function withApiKeyAliases<T extends ApiKey>(key: T): T {
  const keyPrefix = (key.keyPrefix ?? key.prefix) as string;
  let scopes: unknown = key.scopes;
  if (typeof scopes === 'string') {
    try {
      scopes = JSON.parse(scopes);
    } catch {
      scopes = (scopes as string).split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return { ...key, keyPrefix, prefix: keyPrefix, scopes: Array.isArray(scopes) ? scopes : [] };
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
    return (response.apiKeys ?? response.data ?? []).map(withApiKeyAliases);
  }

  /**
   * Create a new API key.
   *
   * Needs a dashboard user session (JWT): the API refuses this for a request authenticated with
   * an API key (`HookbaseForbiddenError`, "This endpoint requires a user session"), so a client
   * constructed with a `whr_` key cannot mint keys.
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
    return withApiKeyAliases(response.data ?? response.apiKey ?? (response as unknown as ApiKeyWithSecret));
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
