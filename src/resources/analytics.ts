import { BaseResource, type ApiClient } from './base';
import type { RequestOptions } from '../types';

export interface DashboardData {
  eventsReceived: number;
  deliveriesCompleted: number;
  deliveriesFailed: number;
  avgLatencyMs: number;
  [key: string]: unknown;
}

/**
 * Analytics resource for dashboard and overview data
 */
export class AnalyticsResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * Get analytics dashboard data
   */
  async dashboard(
    range?: string,
    params: { startDate?: string; endDate?: string } = {},
    options?: RequestOptions
  ): Promise<DashboardData> {
    const response = await this.client.request<{ data: DashboardData }>(
      'GET',
      '/api/analytics/dashboard',
      {
        query: this.buildQuery({ range, ...params }),
        requestOptions: options,
      }
    );
    return response.data ?? (response as unknown as DashboardData);
  }

  /**
   * Get analytics overview
   */
  async overview(
    params: { startDate?: string; endDate?: string } = {},
    options?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client.request('GET', '/api/analytics/overview', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
  }
}
