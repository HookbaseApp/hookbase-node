import { BaseResource, type ApiClient } from './base';
import type {
  PortalToken,
  CreatePortalTokenInput,
  ApiResponse,
  RequestOptions,
} from '../types';

/**
 * Portal Tokens resource for generating embeddable portal access tokens
 */
export class PortalTokensResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * Create a portal token for an application
   */
  async create(
    applicationId: string,
    data: CreatePortalTokenInput = {},
    options?: RequestOptions
  ): Promise<PortalToken> {
    const response = await this.client.request<ApiResponse<PortalToken>>(
      'POST',
      `/api/webhook-applications/${applicationId}/portal-tokens`,
      { body: data, requestOptions: options }
    );
    return response.data;
  }

  /**
   * List portal tokens for an application
   */
  async list(
    applicationId: string,
    options?: RequestOptions
  ): Promise<PortalToken[]> {
    const response = await this.client.request<ApiResponse<PortalToken[]>>(
      'GET',
      `/api/webhook-applications/${applicationId}/portal-tokens`,
      { requestOptions: options }
    );
    return response.data;
  }

  /**
   * Revoke a portal token
   */
  async revoke(
    applicationId: string,
    tokenId: string,
    options?: RequestOptions
  ): Promise<void> {
    await this.client.request(
      'DELETE',
      `/api/portal-tokens/${tokenId}`,
      { requestOptions: options }
    );
  }
}
