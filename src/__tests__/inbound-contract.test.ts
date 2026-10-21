import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';

/**
 * Request/response shapes for the inbound import endpoints and tunnel create, from the routes in
 * api/src/routes/{sources,destinations,routes,tunnels}.ts.
 */
describe('Inbound contract', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    mockFetch.mockReset();
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

  function sentBody(call = 0): Record<string, unknown> {
    return JSON.parse(mockFetch.mock.calls[call][1].body as string);
  }

  describe('import', () => {
    it('sends conflictStrategy skip when the caller leaves it out', async () => {
      // The API 400s without a conflictStrategy.
      mockFetch.mockResolvedValue(mockResponse({ success: true, summary: {}, details: {} }));

      await client.sources.import({ sources: [{ name: 'GitHub', slug: 'github' }] });
      await client.destinations.import({ destinations: [{ name: 'Slack' }], conflictStrategy: 'rename' });
      await client.routes.import({ routes: [{ name: 'r' }] });

      expect(sentBody(0).conflictStrategy).toBe('skip');
      expect(sentBody(1).conflictStrategy).toBe('rename');
      expect(sentBody(2).conflictStrategy).toBe('skip');
    });

    it('parses a sources/destinations import result', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        success: true,
        summary: { imported: 2, skipped: 1, overwritten: 0, failed: 1 },
        details: {
          imported: ['github', 'stripe'],
          skipped: ['shopify'],
          overwritten: [],
          failed: [{ name: 'Broken', error: 'Slug is required' }],
        },
      }));

      const result = await client.sources.import({ sources: [], conflictStrategy: 'skip' });

      expect(result.success).toBe(true);
      expect(result.summary.imported).toBe(2);
      expect(result.summary.failed).toBe(1);
      expect(result.details?.imported).toEqual(['github', 'stripe']);
      expect(result.details?.failed[0]).toEqual({ name: 'Broken', error: 'Slug is required' });
    });

    it('parses a sources/destinations validateOnly result', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        valid: false,
        validationResults: [
          { index: 0, name: 'Slack', slug: 'slack', status: 'rename', errors: [], warnings: [], resolvedSlug: 'slack-2' },
          { index: 1, name: 'Bad', slug: 'BAD', status: 'error', errors: ['Slug must be lowercase'], warnings: [] },
        ],
        summary: { total: 2, toCreate: 1, toOverwrite: 0, toSkip: 0, errors: 1 },
      }));

      const result = await client.destinations.import({
        destinations: [],
        conflictStrategy: 'rename',
        validateOnly: true,
      });

      expect(result.valid).toBe(false);
      expect(result.success).toBeUndefined();
      expect(result.summary.toCreate).toBe(1);
      expect(result.validationResults?.[0].resolvedSlug).toBe('slack-2');
      expect(result.validationResults?.[1].errors).toEqual(['Slug must be lowercase']);
    });

    it('parses a routes import result', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        success: true,
        imported: ['GitHub to Slack'],
        skipped: [],
        errors: [{ name: 'Orphan', error: "Source 'gone' not found. Create it first." }],
        summary: { total: 2, imported: 1, skipped: 0, errors: 1 },
      }));

      const result = await client.routes.import({ routes: [], conflictStrategy: 'skip' });

      expect(result.imported).toEqual(['GitHub to Slack']);
      expect(result.errors?.[0].name).toBe('Orphan');
      expect(result.summary.errors).toBe(1);
    });

    it('parses a routes validateOnly result', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        success: true,
        validateOnly: true,
        validationResults: [
          { index: 0, name: 'GitHub to Slack', status: 'rename', errors: [], warnings: [], resolvedName: 'GitHub to Slack (2)' },
        ],
        summary: { total: 1, valid: 1, skipped: 0, overwrite: 0, errors: 0 },
      }));

      const result = await client.routes.import({ routes: [], conflictStrategy: 'rename', validateOnly: true });

      expect(result.validateOnly).toBe(true);
      expect(result.summary.valid).toBe(1);
      expect(result.validationResults?.[0].resolvedName).toBe('GitHub to Slack (2)');
    });
  });

  describe('tunnels.create', () => {
    it('sends the fields the API reads and drops localPort', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        tunnel: { id: 'tun_1', name: 'dev', subdomain: 'dev-abc', status: 'disconnected', auth_token: 't' },
        tunnelUrl: 'https://api.example.test/t/dev-abc',
        wsUrl: 'wss://api.example.test/tunnels/dev-abc/ws',
        message: 'Tunnel created. Use the CLI to connect.',
      }, 201));

      const tunnel = await client.tunnels.create({
        name: 'dev',
        subdomain: 'dev-abc',
        direction: 'inbound',
        allowedHosts: ['localhost'],
        localPort: 3000,
      });

      expect(sentBody()).toEqual({
        name: 'dev',
        subdomain: 'dev-abc',
        direction: 'inbound',
        allowedHosts: ['localhost'],
      });
      expect(tunnel.id).toBe('tun_1');
    });
  });
});
