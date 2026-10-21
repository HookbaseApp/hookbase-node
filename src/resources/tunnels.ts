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
  /** The subdomain to request; one is generated when left out. 409 when it is taken. */
  subdomain?: string;
  /** `inbound` (default) or `bidirectional` (Pro and Business plans). */
  direction?: 'inbound' | 'bidirectional';
  /** Hosts a bidirectional tunnel may reach, at most 20. */
  allowedHosts?: string[];
  /**
   * @deprecated The API has never read this: the local port is chosen when a client connects
   * (the CLI forwards to whatever local port it is given), not at create. No longer sent.
   */
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
      // `localPort` is dropped rather than sent: the route has no schema, so the key was silently
      // ignored today, and would become a 400 if the route ever validates strictly.
      body: (({ localPort: _localPort, ...rest }) => rest)(data),
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
