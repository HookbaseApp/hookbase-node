import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hookbase } from '../client';
import { HookbaseNotFoundError, HookbaseValidationError } from '../errors';

/**
 * The 2026-10 source contract: open provider strings, null secrets, verify tokens, pending
 * verification, and the provider catalog.
 */
describe('source contract', () => {
  const mockFetch = vi.fn();
  let client: Hookbase;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new Hookbase({ apiKey: 'test_api_key', fetch: mockFetch, retries: 0 });
  });

  function mockResponse(data: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Map(),
      json: () => Promise.resolve(data),
    };
  }

  function lastCall(): [string, RequestInit] {
    return mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [string, RequestInit];
  }

  const WISE_SOURCE = {
    id: 'src_wise',
    name: 'Wise',
    slug: 'wise',
    provider: 'wise',
    hasSigningSecret: false,
    signingSecretLast4: null,
    verifiesWithoutSecret: true,
    awaitingSigningSecret: false,
  };

  describe('responses that broke older clients', () => {
    it('lists a source with a provider newer than this package', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        sources: [WISE_SOURCE, { ...WISE_SOURCE, id: 'src_x', provider: 'not-yet-known' }],
        pagination: { total: 2, page: 1, pageSize: 20 },
      }));
      const result = await client.sources.list();
      expect(result.data.map((s) => s.provider)).toEqual(['wise', 'not-yet-known']);
      expect(result.data[0].verifiesWithoutSecret).toBe(true);
    });

    it('creates a source whose signingSecret is null', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ source: { ...WISE_SOURCE, signingSecret: null } }, 201));
      const created = await client.sources.create({ name: 'Wise', slug: 'wise', provider: 'wise' });
      expect(created.signingSecret).toBeNull();
      expect(created.verifiesWithoutSecret).toBe(true);
    });

    it('reports a secret awaiting registration', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        source: {
          ...WISE_SOURCE, provider: 'notion', verifiesWithoutSecret: false,
          awaitingSigningSecret: true, signingSecret: null,
        },
      }, 201));
      const created = await client.sources.create({ name: 'Notion', slug: 'notion', provider: 'notion' });
      expect(created.awaitingSigningSecret).toBe(true);
    });

    it('sends and returns a WhatsApp verify token', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        source: {
          ...WISE_SOURCE, id: 'src_wa', provider: 'whatsapp', verifiesWithoutSecret: false,
          signingSecret: 'app-secret', verifyToken: 'vt_123',
        },
      }, 201));
      const created = await client.sources.create({
        name: 'WhatsApp', slug: 'wa', provider: 'whatsapp', verifyToken: 'vt_123',
      });
      expect(created.verifyToken).toBe('vt_123');
      expect(JSON.parse(lastCall()[1].body as string).verifyToken).toBe('vt_123');
    });

    it('sends verifyToken: null on update to regenerate it', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));
      await client.sources.update('src_wa', { verifyToken: null, signingSecret: null });
      expect(JSON.parse(lastCall()[1].body as string)).toEqual({ verifyToken: null, signingSecret: null });
    });
  });

  describe('new source endpoints', () => {
    it('reveals the verify token', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ verifyToken: 'vt_1' }));
      expect(await client.sources.verifyToken('src_wa')).toEqual({ verifyToken: 'vt_1' });
      expect(lastCall()[0]).toContain('/api/sources/src_wa/verify-token');
      expect(lastCall()[1].method).toBe('GET');
    });

    it('a verify token on a non-Meta source is a 400', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'stripe has no verify token' }, 400));
      await expect(client.sources.verifyToken('src_1')).rejects.toThrow(HookbaseValidationError);
    });

    it('rotates the verify token', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ verifyToken: 'vt_2' }));
      expect(await client.sources.rotateVerifyToken('src_wa')).toEqual({ verifyToken: 'vt_2' });
      expect(lastCall()[0]).toContain('/api/sources/src_wa/rotate-verify-token');
      expect(lastCall()[1].method).toBe('POST');
    });

    it('reads a pending verification', async () => {
      const pending = {
        provider: 'notion', token: 'secret_abc', receivedAt: '2026-10-11T12:00:00Z', clientIp: null,
      };
      mockFetch.mockResolvedValueOnce(mockResponse(pending));
      expect(await client.sources.getPendingVerification('notion')).toEqual(pending);
      expect(lastCall()[0]).toContain('/api/sources/notion/pending-verification');
    });

    it('no pending verification is a 404', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'No verification token is waiting' }, 404));
      await expect(client.sources.getPendingVerification('notion')).rejects.toThrow(HookbaseNotFoundError);
    });

    it('adopts a pending verification', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));
      expect(await client.sources.adoptPendingVerification('notion')).toEqual({ success: true });
      expect(lastCall()[0]).toContain('/api/sources/notion/pending-verification/adopt');
      expect(lastCall()[1].method).toBe('POST');
    });

    it('rotating a built-in provider secret is a 400', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'wise has no secret to rotate' }, 400));
      await expect(client.sources.rotateSecret('src_wise')).rejects.toThrow(HookbaseValidationError);
    });

    it('an unknown sourceId filter is a 404', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Source not found' }, 404));
      await expect(client.events.list({ sourceId: 'nope' })).rejects.toThrow(HookbaseNotFoundError);
      expect(lastCall()[0]).toContain('sourceId=nope');
    });
  });

  describe('provider catalog', () => {
    const CATALOG = {
      providers: [
        {
          id: 'stripe', name: 'Stripe', category: 'payments', description: 'Payments', icon: 'x',
          eventTypeCount: 12, hookbaseProvider: 'stripe', hasSignatureVerification: true,
          hasIpRanges: true,
          signatureVerification: {
            supported: true, kind: 'hmac', secretSource: 'provider',
            secretLabel: 'Signing secret', secretPlaceholder: 'whsec_...',
          },
        },
        {
          id: 'mollie-nextgen', name: 'Mollie', category: 'payments', description: '', icon: 'm',
          eventTypeCount: 3, hookbaseProvider: 'mollie', hasSignatureVerification: true,
          hasIpRanges: false,
        },
      ],
      categories: ['payments'],
      total: 2,
    };

    it('lists with category and search', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(CATALOG));
      const result = await client.providers.list({ category: 'payments', search: 'str' });
      const url = new URL(lastCall()[0]);
      expect(url.pathname).toBe('/api/catalog/providers');
      expect(url.searchParams.get('category')).toBe('payments');
      expect(url.searchParams.get('search')).toBe('str');
      expect(result.providers[0].signatureVerification?.secretSource).toBe('provider');
      expect(result.providers[1].hookbaseProvider).toBe('mollie');
      expect(result.providers[1].signatureVerification).toBeUndefined();
    });

    it('gets one provider in full', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        provider: {
          id: 'whatsapp', name: 'WhatsApp', hookbaseProvider: 'whatsapp',
          signatureVerification: {
            supported: true, algorithm: 'HMAC-SHA256', headerName: 'X-Hub-Signature-256',
            secretLocationHint: 'App settings', kind: 'hmac', secretLabel: 'App secret',
            secretSource: 'provider', secretInstruction: 'Copy the App secret.',
            verifyToken: { label: 'Verify token', instruction: 'Paste it into Meta.' },
          },
          eventTypes: [{ type: 'messages', description: 'Inbound messages' }],
          samplePayloads: {}, ipRanges: null, setupGuide: [],
        },
      }));
      const detail = await client.providers.get('whatsapp');
      expect(lastCall()[0]).toContain('/api/catalog/providers/whatsapp');
      expect(detail.signatureVerification?.verifyToken?.label).toBe('Verify token');
    });

    it('an unknown provider is a 404', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Provider not found' }, 404));
      await expect(client.providers.get('nope')).rejects.toThrow(HookbaseNotFoundError);
    });

    it('lists a provider\'s events', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({
        providerId: 'stripe', providerName: 'Stripe',
        eventTypes: [{ type: 'charge.succeeded', description: 'A charge succeeded' }],
        samplePayloads: { 'charge.succeeded': { id: 'evt_1' } },
      }));
      const events = await client.providers.events('stripe');
      expect(lastCall()[0]).toContain('/api/catalog/providers/stripe/events');
      expect(events.eventTypes[0].type).toBe('charge.succeeded');
    });
  });
});
