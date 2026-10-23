import { BaseResource, type ApiClient } from './base';
import type { RequestOptions } from '../types';

export interface Tunnel {
  id: string;
  name: string;
  subdomain?: string;
  status: string;
  direction?: 'inbound' | 'bidirectional';
  allowedHosts?: string[] | null;
  /** @deprecated The API has never returned this. */
  localPort?: number;
  createdAt: string;
  [key: string]: unknown;
}

/** What `tunnels.create` returns: the tunnel plus its one-time credentials and URLs. */
export interface CreatedTunnel extends Tunnel {
  /** The tunnel's auth token, shown once (the API sends it as `auth_token`). */
  authToken: string;
  /** Public URL that forwards to the tunnel. */
  tunnelUrl?: string;
  /** WebSocket URL a client connects to, token included. */
  wsUrl?: string;
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
  ): Promise<CreatedTunnel> {
    const response = await this.client.request<{
      tunnel?: Tunnel;
      data?: Tunnel;
      tunnelUrl?: string;
      wsUrl?: string;
    }>('POST', '/api/tunnels', {
      // `localPort` is dropped rather than sent: the route has no schema, so the key was silently
      // ignored today, and would become a 400 if the route ever validates strictly.
      body: (({ localPort: _localPort, ...rest }) => rest)(data),
      requestOptions: options,
    });
    // `tunnelUrl` and `wsUrl` sit next to `tunnel`, not in it, and were dropped.
    const tunnel = (response.tunnel ?? response.data ?? (response as unknown as Tunnel)) as Tunnel & {
      auth_token?: string;
      authToken?: string;
    };
    return {
      ...tunnel,
      authToken: (tunnel.authToken ?? tunnel.auth_token) as string,
      tunnelUrl: response.tunnelUrl,
      wsUrl: response.wsUrl,
    };
  }

  /**
   * Delete a tunnel
   */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this.client.request('DELETE', `/api/tunnels/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
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
