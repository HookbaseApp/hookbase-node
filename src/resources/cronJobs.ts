import { BaseResource, type ApiClient } from './base';
import type { RequestOptions } from '../types';

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  url: string;
  method: string;
  isActive: boolean;
  description?: string;
  groupId?: string;
  createdAt: string;
  [key: string]: unknown;
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
  body?: string;
  isActive?: boolean;
  description?: string;
  groupId?: string;
  timezone?: string;
}

export interface UpdateCronJobInput {
  name?: string;
  cronExpression?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  isActive?: boolean;
  description?: string;
  groupId?: string;
  timezone?: string;
}

export interface CreateCronGroupInput {
  name: string;
  description?: string;
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
      body: data,
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
      body: data,
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
