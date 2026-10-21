import { BaseResource, type ApiClient } from './base';
import type { RequestOptions } from '../types';

export interface CronJob {
  id: string;
  organizationId: string;
  groupId: string | null;
  name: string;
  description: string | null;
  cronExpression: string;
  timezone: string;
  url: string;
  method: string;
  headers: string | null;
  payload: string | null;
  timeoutMs: number;
  useStaticIp: boolean;
  isActive: boolean;
  notifyOnFailure: boolean;
  notifyOnSuccess: boolean;
  notifyEmails: string | null;
  consecutiveFailures: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CronJobExecution {
  id: string;
  status: 'success' | 'failed';
  responseStatus: number | null;
  latencyMs: number;
}

export interface CronGroup {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface CreateCronJobInput {
  name: string;
  cronExpression: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** Request body sent on each run. */
  payload?: string;
  /**
   * @deprecated The API reads `payload` and has never read a `body` key, so a job created with
   * one ran with an empty body. Still accepted and sent as `payload`; `payload` wins if both are set.
   */
  body?: string;
  isActive?: boolean;
  description?: string;
  groupId?: string;
  timezone?: string;
  useStaticIp?: boolean;
  timeoutMs?: number;
  notifyOnFailure?: boolean;
  notifyOnSuccess?: boolean;
  notifyEmails?: string;
}

export interface UpdateCronJobInput {
  name?: string;
  cronExpression?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  /** Request body sent on each run. */
  payload?: string;
  /**
   * @deprecated The API reads `payload` and has never read a `body` key, so a job created with
   * one ran with an empty body. Still accepted and sent as `payload`; `payload` wins if both are set.
   */
  body?: string;
  isActive?: boolean;
  description?: string;
  groupId?: string | null;
  timezone?: string;
  useStaticIp?: boolean;
  timeoutMs?: number;
  notifyOnFailure?: boolean;
  notifyOnSuccess?: boolean;
  notifyEmails?: string;
}

export interface CreateCronGroupInput {
  name: string;
  description?: string;
}

/** Carry the deprecated `body` key to `payload`, the name the API reads. */
function cronJobBody(input: CreateCronJobInput | UpdateCronJobInput): Record<string, unknown> {
  const { body, ...rest } = input;
  const wire: Record<string, unknown> = { ...rest };
  if (wire.payload === undefined && body !== undefined) {
    wire.payload = body;
  }
  return wire;
}

/**
 * Cron Jobs resource for managing scheduled tasks
 */
export class CronJobsResource extends BaseResource {
  constructor(client: ApiClient) {
    super(client);
  }

  /**
   * List all cron jobs with page-based pagination
   */
  async list(
    params: { page?: number; pageSize?: number } = {},
    options?: RequestOptions
  ): Promise<CronJob[]> {
    const response = await this.client.request<{
      cronJobs: CronJob[];
    }>('GET', '/api/cron', {
      query: this.buildQuery(params),
      requestOptions: options,
    });
    return response.cronJobs;
  }

  /**
   * Get a cron job by ID
   */
  async get(id: string, options?: RequestOptions): Promise<CronJob> {
    const response = await this.client.request<{
      cronJob?: CronJob;
      data?: CronJob;
    }>('GET', `/api/cron/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
    return response.cronJob ?? response.data ?? (response as unknown as CronJob);
  }

  /**
   * Create a new cron job
   */
  async create(
    data: CreateCronJobInput,
    options?: RequestOptions
  ): Promise<CronJob> {
    const response = await this.client.request<{
      cronJob?: CronJob;
      data?: CronJob;
    }>('POST', '/api/cron', {
      body: cronJobBody(data),
      requestOptions: options,
    });
    return response.cronJob ?? response.data ?? (response as unknown as CronJob);
  }

  /**
   * Update a cron job
   */
  async update(
    id: string,
    data: UpdateCronJobInput,
    options?: RequestOptions
  ): Promise<void> {
    await this.client.request('PATCH', `/api/cron/${encodeURIComponent(id)}`, {
      body: cronJobBody(data),
      requestOptions: options,
    });
  }

  /**
   * Delete a cron job
   */
  async delete(id: string, options?: RequestOptions): Promise<void> {
    await this.client.request('DELETE', `/api/cron/${encodeURIComponent(id)}`, {
      requestOptions: options,
    });
  }

  /**
   * Run a cron job on demand, outside its schedule. Counts as a monthly event on free plans
   * the same as a scheduled run, and honours the job's `useStaticIp` setting.
   */
  async trigger(id: string, options?: RequestOptions): Promise<CronJobExecution> {
    const response = await this.client.request<{ execution: CronJobExecution }>(
      'POST',
      `/api/cron/${encodeURIComponent(id)}/trigger`,
      { requestOptions: options }
    );
    return response.execution;
  }

  /**
   * List all cron groups
   */
  async listGroups(options?: RequestOptions): Promise<CronGroup[]> {
    const response = await this.client.request<{
      groups?: CronGroup[];
      data?: CronGroup[];
    }>('GET', '/api/cron-groups', { requestOptions: options });
    return response.groups ?? response.data ?? [];
  }

  /**
   * Create a new cron group
   */
  async createGroup(
    data: CreateCronGroupInput,
    options?: RequestOptions
  ): Promise<CronGroup> {
    const response = await this.client.request<{
      group?: CronGroup;
      data?: CronGroup;
    }>('POST', '/api/cron-groups', {
      body: data,
      requestOptions: options,
    });
    return response.group ?? response.data ?? (response as unknown as CronGroup);
  }
}
