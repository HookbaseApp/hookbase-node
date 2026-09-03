import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';

describe('CronJobsResource', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new Hookbase({
      apiKey: 'test_api_key',
      fetch: mockFetch,
      retries: 0,
    });
  });

  function mockResponse(data: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Map(),
      json: () => Promise.resolve(data),
    };
  }

  it('lists cron jobs with the fields the API actually sends', async () => {
    // GET /api/cron sends cronExpression, timezone, nextRunAt, lastRunAt and
    // consecutiveFailures — none of which the CronJob type used to declare (it declared a
    // "schedule" field the API has never sent instead).
    mockFetch.mockResolvedValueOnce(mockResponse({
      cronJobs: [
        {
          id: 'cron_1',
          organizationId: 'org_1',
          groupId: null,
          name: 'Nightly sync',
          description: null,
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
          url: 'https://example.com/sync',
          method: 'POST',
          headers: null,
          payload: null,
          timeoutMs: 30000,
          useStaticIp: false,
          isActive: true,
          notifyOnFailure: true,
          notifyOnSuccess: false,
          notifyEmails: null,
          consecutiveFailures: 0,
          lastRunAt: '2026-09-01T00:00:00Z',
          nextRunAt: '2026-09-02T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
      ],
    }));

    const [job] = await client.cronJobs.list();

    expect(job.cronExpression).toBe('0 0 * * *');
    expect(job.nextRunAt).toBe('2026-09-02T00:00:00Z');
    expect(job.consecutiveFailures).toBe(0);
  });

  it('triggers a cron job on demand and returns the execution result', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      execution: {
        id: 'exec_1',
        status: 'success',
        responseStatus: 200,
        latencyMs: 142,
      },
    }));

    const result = await client.cronJobs.trigger('cron_1');

    expect(result).toEqual({
      id: 'exec_1',
      status: 'success',
      responseStatus: 200,
      latencyMs: 142,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/cron/cron_1/trigger'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
