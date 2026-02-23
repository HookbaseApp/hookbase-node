import { BaseResource, type ApiClient } from './base';
import type { RequestOptions } from '../types';

export interface Tunnel {
  id: string;
  name: string;
  status: string;
  localPort?: number;
  createdAt: string;
  [key: string]: unknown;
}

export interface CreateTunnelInput {
  name: string;
  localPort?: number;
}

/**
 * Tunnels resource for managing local development tunnels
 */
export class TunnelsResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List all tunnels
   */
  async list(options?: RequestOptions): Promise<Tunnel[]> {
    const response = await this.client.request<{
      tunnels?: Tunnel[];
      data?: Tunnel[];
    }>('GET', '/api/tunnels', { requestOptions: options });
    return response.tunnels ?? response.data ?? [];
  }

  /**
   * Get a tunnel by ID
   */
  async get(id: string, options?: RequestOptions): Promise<Tunnel> {
    const response = await this.client.request<{
      tunnel?: Tunnel;
      data?: Tunnel;
    }>('GET', `/api/tunnels/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
    return response.tunnel ?? response.data ?? (response as unknown as Tunnel);
  }

  /**
   * Create a new tunnel
   */
  async create(
    data: CreateTunnelInput,
    options?: RequestOptions
  ): Promise<Tunnel> {
    const response = await this.client.request<{
      tunnel?: Tunnel;
      data?: Tunnel;
    }>('POST', '/api/tunnels', {
      body: data,
      requestOptions: options,
    });
    return response.tunnel ?? response.data ?? (response as unknown as Tunnel);
  }

  /**
   * Bulk delete tunnels
   */
  async bulkDelete(
    ids: string[],
    options?: RequestOptions
  ): Promise<{ success: boolean; deleted: number }> {
    return this.client.request('DELETE', '/api/tunnels/bulk', {
      body: { ids },
      requestOptions: options,
    });
  }
}
