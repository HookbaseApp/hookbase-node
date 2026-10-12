import { BaseResource, type ApiClient } from './base';
import type {
  CatalogProviderDetail,
  ListCatalogProvidersParams,
  ProviderCatalogList,
  ProviderEvents,
  RequestOptions,
} from '../types';

/**
 * The public provider catalog: what each provider signs with and which secret a source for it
 * needs. No authentication is required by the API, though the client's key is still sent.
 */
export class ProvidersResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List catalog providers, optionally narrowed by category or a name/description search
   */
  async list(
    params: ListCatalogProvidersParams = {},
    options?: RequestOptions
  ): Promise<ProviderCatalogList> {
    return this.client.request<ProviderCatalogList>('GET', '/api/catalog/providers', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
  }

  /**
   * Get one provider in full by catalog id. 404 for an unknown id.
   */
  async get(id: string, options?: RequestOptions): Promise<CatalogProviderDetail> {
    const response = await this.client.request<{ provider: CatalogProviderDetail }>(
      'GET',
      `/api/catalog/providers/${encodeURIComponent(id)}`,
      { requestOptions: options }
    );
    return response.provider;
  }

  /**
   * A provider's event types and sample payloads. 404 for an unknown id.
   */
  async events(id: string, options?: RequestOptions): Promise<ProviderEvents> {
    return this.client.request<ProviderEvents>(
      'GET',
      `/api/catalog/providers/${encodeURIComponent(id)}/events`,
      { requestOptions: options }
    );
  }
}
