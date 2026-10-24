import { BaseResource, type ApiClient } from './base';
import type { RequestOptions } from '../types';

/** Delivery totals. The API sends these snake_case; the SDK maps them to camelCase. */
export interface AnalyticsOverviewStats {
  totalEvents: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  /** Average delivery latency in ms; null when there were no deliveries. */
  avgLatency: number | null;
  sourceCount?: number;
  destinationCount?: number;
}

/** `GET /analytics/dashboard`: every dashboard panel in one response. */
export interface DashboardData {
  overview: AnalyticsOverviewStats;
  timeline: Array<Record<string, unknown>>;
  latency: Record<string, unknown>;
  latencyDistribution: Array<Record<string, unknown>>;
  latencyTrends: Array<Record<string, unknown>>;
  errors: Record<string, unknown>;
  retries: Record<string, unknown>;
  sources: Array<Record<string, unknown>>;
  destinations: Array<Record<string, unknown>>;
  routes: Array<Record<string, unknown>>;
  payloadSizes: Record<string, unknown> | null;
  /** The range the data covers, e.g. `7d`. */
  range: string;
  /** The timeline bucket size. */
  interval: string;

  /** @deprecated The API has never sent this; the SDK fills it from `overview.totalEvents`. */
  eventsReceived: number;
  /** @deprecated The API has never sent this; the SDK fills it from `overview.successfulDeliveries`. */
  deliveriesCompleted: number;
  /** @deprecated The API has never sent this; the SDK fills it from `overview.failedDeliveries`. */
  deliveriesFailed: number;
  /** @deprecated The API has never sent this; the SDK fills it from `overview.avgLatency` (0 when null). */
  avgLatencyMs: number;
  [key: string]: unknown;
}

export interface DashboardParams {
  /** Custom window start (ISO 8601); used with `endDate` instead of `range`. */
  startDate?: string;
  endDate?: string;
  /** IANA time zone for the timeline buckets, e.g. `Europe/Berlin`. Defaults to UTC. */
  tz?: string;
  /** Scope the data to one source (UUID). */
  sourceId?: string;
  /** Scope the data to one destination (UUID). */
  destinationId?: string;
}

/** `GET /analytics/overview`: all-time totals. */
export interface AnalyticsOverview extends AnalyticsOverviewStats {
  /** The API's own snake_case object, as sent. */
  stats: Record<string, number | null>;
}

type RawOverview = {
  total_events?: number;
  successful_deliveries?: number;
  failed_deliveries?: number;
  avg_latency?: number | null;
  source_count?: number;
  destination_count?: number;
};

function overviewStats(raw: RawOverview | undefined): AnalyticsOverviewStats {
  const stats: AnalyticsOverviewStats = {
    totalEvents: raw?.total_events ?? 0,
    successfulDeliveries: raw?.successful_deliveries ?? 0,
    failedDeliveries: raw?.failed_deliveries ?? 0,
    avgLatency: raw?.avg_latency ?? null,
  };
  if (raw?.source_count !== undefined) stats.sourceCount = raw.source_count;
  if (raw?.destination_count !== undefined) stats.destinationCount = raw.destination_count;
  return stats;
}

/**
 * Analytics resource for dashboard and overview data
 */
export class AnalyticsResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * Get analytics dashboard data for a range (`24h`, `7d`, `30d`, ...; the API defaults to `7d`).
   */
  async dashboard(
    range?: string,
    params: DashboardParams = {},
    options?: RequestOptions
  ): Promise<DashboardData> {
    const response = await this.client.request<Record<string, unknown> & { data?: unknown }>(
      'GET',
      '/api/analytics/dashboard',
      {
        query: this.buildQuery({ range, ...params }),
        requestOptions: options,
      }
    );
    // The API returns the dashboard object itself, not `{ data }`.
    const raw = (response.data && typeof response.data === 'object' ? response.data : response) as Record<
      string,
      unknown
    >;
    const overview = overviewStats(raw.overview as RawOverview | undefined);
    return {
      ...raw,
      overview,
      eventsReceived: overview.totalEvents,
      deliveriesCompleted: overview.successfulDeliveries,
      deliveriesFailed: overview.failedDeliveries,
      avgLatencyMs: overview.avgLatency ?? 0,
    } as DashboardData;
  }

  /**
   * Get all-time analytics totals.
   *
   * @param params - Deprecated and ignored: the API always reports all-time totals. Use
   *   `dashboard()` for a date range.
   */
  async overview(
    params: { startDate?: string; endDate?: string } = {},
    options?: RequestOptions
  ): Promise<AnalyticsOverview> {
    void params;
    const response = await this.client.request<{ stats?: RawOverview }>('GET', '/api/analytics/overview', {
      requestOptions: options,
    });
    return { ...overviewStats(response.stats), stats: (response.stats ?? {}) as Record<string, number | null> };
  }
}
