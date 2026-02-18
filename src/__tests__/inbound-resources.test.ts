import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';

describe('Inbound Resources', () => {
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

  // Helper to create a mock response
  function mockResponse(data: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Map(),
      json: () => Promise.resolve(data),
    };
  }

  // =============================================
  // Sources
  // =============================================
  describe('SourcesResource', () => {
    it('should list sources with page-based pagination', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        sources: [{ id: 'src_1', name: 'GitHub' }, { id: 'src_2', name: 'Stripe' }],
        pagination: { total: 5, page: 1, pageSize: 2 },
      }));

      const result = await client.sources.list({ page: 1, pageSize: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(0);
    });

    it('should get source by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        source: { id: 'src_1', name: 'GitHub', slug: 'github' },
      }));

      const result = await client.sources.get('src_1');

      expect(result.id).toBe('src_1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sources/src_1'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should create source and return with secret', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        source: { id: 'src_new', name: 'New Source', signingSecret: 'whsec_abc123' },
      }));

      const result = await client.sources.create({ name: 'New Source' });

      expect(result.signingSecret).toBe('whsec_abc123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sources'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should update source', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, headers: new Map(), json: () => Promise.resolve({ success: true }) });

      await client.sources.update('src_1', { name: 'Updated' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sources/src_1'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('should delete source', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, headers: new Map() });

      await client.sources.delete('src_1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sources/src_1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should rotate secret', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ signingSecret: 'whsec_new123' }));

      const result = await client.sources.rotateSecret('src_1');

      expect(result.signingSecret).toBe('whsec_new123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sources/src_1/rotate-secret'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should reveal secret', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ signingSecret: 'whsec_abc123' }));

      const result = await client.sources.revealSecret('src_1');

      expect(result.signingSecret).toBe('whsec_abc123');
    });

    it('should bulk delete sources', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true, deleted: 3 }));

      const result = await client.sources.bulkDelete(['src_1', 'src_2', 'src_3']);

      expect(result.deleted).toBe(3);
    });

    it('should iterate through all sources', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        sources: [{ id: 'src_1' }, { id: 'src_2' }],
        pagination: { total: 3, page: 1, pageSize: 2 },
      }));
      mockFetch.mockResolvedValueOnce(mockResponse({
        sources: [{ id: 'src_3' }],
        pagination: { total: 3, page: 2, pageSize: 2 },
      }));

      const items: { id: string }[] = [];
      for await (const source of client.sources.listAll({ pageSize: 2 })) {
        items.push(source);
      }

      expect(items).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================
  // Destinations
  // =============================================
  describe('DestinationsResource', () => {
    it('should list destinations', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        destinations: [{ id: 'dst_1', name: 'My Endpoint', url: 'https://example.com' }],
        pagination: { total: 1, page: 1, pageSize: 20 },
      }));

      const result = await client.destinations.list();

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should get destination by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        destination: { id: 'dst_1', name: 'My Endpoint', url: 'https://example.com' },
      }));

      const result = await client.destinations.get('dst_1');

      expect(result.id).toBe('dst_1');
    });

    it('should create destination', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        destination: { id: 'dst_new', name: 'New Dest', url: 'https://example.com/hook' },
      }));

      const result = await client.destinations.create({
        name: 'New Dest',
        url: 'https://example.com/hook',
      });

      expect(result.name).toBe('New Dest');
    });

    it('should delete destination', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, headers: new Map() });

      await client.destinations.delete('dst_1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/destinations/dst_1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should test destination', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        success: true,
        statusCode: 200,
        duration: 150,
        responseBody: 'OK',
      }));

      const result = await client.destinations.test('dst_1');

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });
  });

  // =============================================
  // Routes
  // =============================================
  describe('RoutesResource', () => {
    it('should list routes', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        routes: [{ id: 'rt_1', name: 'GitHub to Slack' }],
        pagination: { total: 1, page: 1, pageSize: 20 },
      }));

      const result = await client.routes.list();

      expect(result.data).toHaveLength(1);
    });

    it('should get route by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        route: { id: 'rt_1', name: 'GitHub to Slack', sourceId: 'src_1', destinationId: 'dst_1' },
      }));

      const result = await client.routes.get('rt_1');

      expect(result.id).toBe('rt_1');
    });

    it('should create route', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        route: { id: 'rt_new', name: 'New Route', sourceId: 'src_1', destinationId: 'dst_1' },
      }));

      const result = await client.routes.create({
        name: 'New Route',
        sourceId: 'src_1',
        destinationId: 'dst_1',
      });

      expect(result.name).toBe('New Route');
    });

    it('should bulk delete routes', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true, deleted: 2 }));

      const result = await client.routes.bulkDelete(['rt_1', 'rt_2']);

      expect(result.deleted).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/routes/bulk'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should bulk update routes', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true, updated: 2 }));

      const result = await client.routes.bulkUpdate(['rt_1', 'rt_2'], { isActive: false });

      expect(result.updated).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/routes/bulk'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('should get circuit status', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        circuitState: 'open',
        circuitOpenedAt: '2024-01-01T00:00:00Z',
        circuitCooldownSeconds: 60,
        circuitFailureThreshold: 5,
        circuitProbeSuccessThreshold: 2,
        recentFailures: 5,
      }));

      const result = await client.routes.getCircuitStatus('rt_1');

      expect(result.circuitState).toBe('open');
      expect(result.recentFailures).toBe(5);
    });

    it('should reset circuit', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        success: true,
        circuitState: 'closed',
        previousState: 'open',
      }));

      const result = await client.routes.resetCircuit('rt_1');

      expect(result.circuitState).toBe('closed');
      expect(result.previousState).toBe('open');
    });

    it('should update circuit config', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await client.routes.updateCircuitConfig('rt_1', {
        circuitCooldownSeconds: 120,
        circuitFailureThreshold: 10,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/routes/rt_1/circuit'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  // =============================================
  // Events (inbound)
  // =============================================
  describe('EventsResource', () => {
    it('should list events with offset-based pagination', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        events: [
          { id: 'evt_1', eventType: 'push', status: 'delivered' },
          { id: 'evt_2', eventType: 'push', status: 'pending' },
        ],
        total: 100,
        limit: 50,
        offset: 0,
      }));

      const result = await client.events.list({ limit: 50 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(100);
      expect(result.hasMore).toBe(true);
    });

    it('should get event detail', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        event: { id: 'evt_1', eventType: 'push', payload: { ref: 'main' } },
        deliveries: [{ id: 'del_1', status: 'success', destinationName: 'Slack' }],
      }));

      const result = await client.events.get('evt_1');

      expect(result.id).toBe('evt_1');
      expect(result.deliveries).toHaveLength(1);
    });

    it('should get debug info', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        event: { id: 'evt_1', eventType: 'push' },
        curlCommand: 'curl -X POST ...',
      }));

      const result = await client.events.debug('evt_1');

      expect(result.curlCommand).toBeTruthy();
    });

    it('should iterate through all events', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        events: [{ id: 'evt_1' }, { id: 'evt_2' }],
        total: 3,
        limit: 2,
        offset: 0,
      }));
      mockFetch.mockResolvedValueOnce(mockResponse({
        events: [{ id: 'evt_3' }],
        total: 3,
        limit: 2,
        offset: 2,
      }));

      const items: { id: string }[] = [];
      for await (const evt of client.events.listAll({ limit: 2 })) {
        items.push(evt);
      }

      expect(items).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================
  // Deliveries
  // =============================================
  describe('DeliveriesResource', () => {
    it('should list deliveries', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        deliveries: [{ id: 'del_1', status: 'success' }],
        limit: 50,
        offset: 0,
      }));

      const result = await client.deliveries.list();

      expect(result.data).toHaveLength(1);
    });

    it('should get delivery by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        delivery: { id: 'del_1', status: 'success', statusCode: 200 },
      }));

      const result = await client.deliveries.get('del_1');

      expect(result.id).toBe('del_1');
    });

    it('should replay a delivery', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        deliveryId: 'del_new',
        message: 'Replay queued',
      }));

      const result = await client.deliveries.replay('del_1');

      expect(result.deliveryId).toBe('del_new');
    });

    it('should bulk replay deliveries', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        message: '3 deliveries queued for replay',
        queued: 3,
        skipped: 0,
        results: [],
      }));

      const result = await client.deliveries.bulkReplay(['del_1', 'del_2', 'del_3']);

      expect(result.queued).toBe(3);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/deliveries/bulk-replay'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should bulk replay events', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        message: '2 failed deliveries queued for replay',
        queued: 2,
        skipped: 1,
        results: [],
      }));

      const result = await client.deliveries.bulkReplayEvents(['evt_1', 'evt_2']);

      expect(result.queued).toBe(2);
      expect(result.skipped).toBe(1);
    });
  });

  // =============================================
  // Transforms
  // =============================================
  describe('TransformsResource', () => {
    it('should list transforms', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        transforms: [{ id: 'tr_1', name: 'Strip headers' }],
        pagination: { total: 1, page: 1, pageSize: 20 },
      }));

      const result = await client.transforms.list();

      expect(result.data).toHaveLength(1);
    });

    it('should get transform by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        transform: { id: 'tr_1', name: 'Strip headers', code: '$' },
      }));

      const result = await client.transforms.get('tr_1');

      expect(result.name).toBe('Strip headers');
    });

    it('should create transform', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        transform: { id: 'tr_new', name: 'New Transform', transformType: 'jsonata', code: '$' },
      }));

      const result = await client.transforms.create({
        name: 'New Transform',
        transformType: 'jsonata',
        code: '$',
      });

      expect(result.id).toBe('tr_new');
    });

    it('should test transform', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        success: true,
        output: { transformed: true },
        executionTimeMs: 5,
      }));

      const result = await client.transforms.test({
        transformType: 'jsonata',
        code: '$.data',
        payload: { data: { transformed: true } },
      });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ transformed: true });
    });

    it('should delete transform', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, headers: new Map() });

      await client.transforms.delete('tr_1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/transforms/tr_1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // =============================================
  // Filters
  // =============================================
  describe('FiltersResource', () => {
    it('should list filters', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        filters: [{ id: 'fl_1', name: 'Only pushes' }],
        pagination: { total: 1, page: 1, pageSize: 20 },
      }));

      const result = await client.filters.list();

      expect(result.data).toHaveLength(1);
    });

    it('should get filter by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        filter: { id: 'fl_1', name: 'Only pushes', conditions: [{ field: 'type', operator: 'eq', value: 'push' }] },
      }));

      const result = await client.filters.get('fl_1');

      expect(result.conditions).toHaveLength(1);
    });

    it('should create filter', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        filter: { id: 'fl_new', name: 'New Filter', conditions: [{ field: 'type', operator: 'eq', value: 'push' }], logic: 'and' },
      }));

      const result = await client.filters.create({
        name: 'New Filter',
        conditions: [{ field: 'type', operator: 'eq', value: 'push' }],
      });

      expect(result.id).toBe('fl_new');
    });

    it('should test filter conditions', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        matches: true,
        results: [{ passed: true }],
        logic: 'and',
      }));

      const result = await client.filters.test({
        conditions: [{ field: 'type', operator: 'eq', value: 'push' }],
        payload: { type: 'push' },
      });

      expect(result.matches).toBe(true);
      expect(result.results).toHaveLength(1);
    });
  });

  // =============================================
  // Schemas
  // =============================================
  describe('SchemasResource', () => {
    it('should list schemas', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        schemas: [{ id: 'sch_1', name: 'Webhook Event' }],
      }));

      const result = await client.schemas.list();

      expect(result.data).toHaveLength(1);
    });

    it('should get schema with routes', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        schema: {
          id: 'sch_1',
          name: 'Webhook Event',
          routes: [{ id: 'rt_1', name: 'GitHub to Slack' }],
        },
      }));

      const result = await client.schemas.get('sch_1');

      expect(result.routes).toHaveLength(1);
    });

    it('should create schema', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        schema: { id: 'sch_new', name: 'New Schema' },
      }));

      const result = await client.schemas.create({
        name: 'New Schema',
        jsonSchema: { type: 'object', properties: { event: { type: 'string' } } },
      });

      expect(result.name).toBe('New Schema');
    });

    it('should validate payload against schema', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        valid: false,
        errors: ['Missing required field: event'],
      }));

      const result = await client.schemas.validate('sch_1', { foo: 'bar' });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });
});
