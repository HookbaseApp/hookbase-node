import { HookbaseError } from '../errors';
import type { CreateApiKeyInput } from './apiKeys';
import type {
  Application,
  CreateDestinationInput,
  CreateEndpointInput,
  EndpointHeader,
  EndpointHeadersInput,
  Endpoint,
  UpdateDestinationInput,
  UpdateEndpointInput,
} from '../types';

/**
 * The boundary between the field names this SDK's inputs accept and the field names the API
 * accepts.
 *
 * They drifted apart. `z.object()` strips keys it does not recognise rather than refusing them, so
 * for as long as the API's schemas were plain objects a body carrying `filterTypes` or `retryCount`
 * came back 2xx with the setting quietly dropped — a caller who asked for a rate limit got an
 * endpoint with none and nothing anywhere said so. Those schemas are becoming `.strict()`, which
 * turns every one of those keys into a 400.
 *
 * Deleting the fields from the public types would break builds for the people who set them, so
 * they stay, marked `@deprecated`, and this module is what keeps them off the wire: a stale name is
 * dropped, a renamed one is carried to its current name, and a field whose shape changed is
 * converted here rather than at the call site.
 */

/** Keys present on both endpoint inputs; `keyof` both so a typo or a removed field fails tsc. */
type EndpointInputKey = keyof CreateEndpointInput & keyof UpdateEndpointInput;

/** Keys the endpoints API has never accepted. Dropped from the body instead of sent. */
const ENDPOINT_STALE_KEYS: ReadonlyArray<EndpointInputKey> = [
  'filterTypes',
  'rateLimitPeriod',
  'metadata',
];

/** Deprecated endpoint key -> the name the API takes. The current name wins if both are set. */
const ENDPOINT_RENAMES: Partial<Record<EndpointInputKey, EndpointInputKey>> = {
  rateLimit: 'rateLimitPerSecond',
};

type DestinationInputKey = keyof CreateDestinationInput & keyof UpdateDestinationInput;

/** Keys the destinations API has never accepted. Dropped from the body instead of sent. */
const DESTINATION_STALE_KEYS: ReadonlyArray<DestinationInputKey> = [
  'description',
  'retryCount',
  'retryInterval',
];

/** Deprecated destination key -> the name the API takes. The current name wins if both are set. */
const DESTINATION_RENAMES: Partial<Record<DestinationInputKey, DestinationInputKey>> = {
  timeout: 'timeoutMs',
};

/** Max length of a destination slug, as `createDestinationSchema` enforces it. */
const SLUG_MAX_LENGTH = 50;

/**
 * The slug fold's answer depends on the Unicode version the *runtime* ships, and the four SDKs'
 * runtimes do not agree: `package.json` allows Node 18, whose V8 is two Unicode releases behind the
 * current one, and CPython 3.12 and Go 1.22 are both on Unicode 15.0. Left alone, the same name
 * slugs differently depending on which SDK — and which Node — created the destination, which is the
 * thing this derivation exists to prevent.
 *
 * These tables pin the fold to one Unicode version regardless of runtime. On a runtime whose own
 * data already agrees they are no-ops, so they only ever close a gap. The same tables live in
 * `python-sdk/src/hookbase/models/_wire.py` (`_SLUG_MARK_ADDITIONS`, `_SLUG_MARK_RECLASSIFIED`,
 * `_SLUG_FOLD_ADDITIONS`), `go-sdk/slug_fold.go` and
 * `dotnet-sdk/src/Hookbase/Models/Destinations/Destination.cs`. Change one and you change all four.
 *
 * Exported for `wire-format.test.ts`, which checks the ranges against a list written out
 * independently — on a current Node `\p{Mn}` already covers them, so a behavioural test alone
 * cannot see a typo here. Not re-exported from the package index.
 */
export const SLUG_MARK_ADDITIONS =
  /^[\u{0897}\u{1ACF}-\u{1ADD}\u{1AE0}-\u{1AEB}\u{10D69}-\u{10D6D}\u{10EFA}-\u{10EFC}\u{113BB}-\u{113C0}\u{113CE}\u{113D0}\u{113D2}\u{113E1}-\u{113E2}\u{11B60}\u{11B62}-\u{11B64}\u{11B66}\u{11F5A}\u{1611E}-\u{16129}\u{1612D}-\u{1612F}\u{1E5EE}-\u{1E5EF}\u{1E6E3}\u{1E6E6}\u{1E6EE}-\u{1E6EF}\u{1E6F5}]$/u;

/** Every combining mark the fold drops: the category, plus the 75 code points Unicode 15.0 lacks. */
const SLUG_MARKS = new RegExp(
  `[\\p{Mn}${SLUG_MARK_ADDITIONS.source.slice('^['.length, -']$'.length)}]`,
  'gu'
);

/**
 * AHOM CONSONANT SIGN MEDIAL RA: `Mn` in Unicode 15.0 and `Mc` — a *spacing* mark — from 15.1. A
 * runtime on 15.0 matches it as a mark above, so it is put back rather than stripped: it separates,
 * the way any other non-alphanumeric does.
 */
const SLUG_MARK_RECLASSIFIED = '\u{1171E}';

/**
 * The same version skew one layer down, in NFKD itself. These characters are unassigned before
 * Unicode 16, so an older runtime leaves them alone and they become separators, while a current one
 * decomposes them to ASCII. Folding them first makes NFKD's answer the same on both: U+A7F1 (Latin
 * Extended-D) decomposes to `S`, and U+1CCD6-U+1CCF9 are 36 contiguous additions in Symbols for
 * Legacy Computing Supplement decomposing to A-Z and then 0-9 in order.
 */
const SLUG_FOLD_ADDITIONS = /[\u{A7F1}\u{1CCD6}-\u{1CCF9}]/gu;
const SLUG_FOLD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Copy an input into a request body, dropping the keys the API has never accepted and moving the
 * renamed ones to their current name.
 *
 * `undefined` values are dropped too: `JSON.stringify` would omit them anyway, and skipping them
 * here means a deprecated key explicitly set to `undefined` cannot win a rename over the current
 * key.
 */
function toRequestBody(
  input: object,
  staleKeys: ReadonlyArray<string>,
  renames: Readonly<Record<string, string | undefined>>
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (staleKeys.includes(key)) continue;
    body[key] = value;
  }

  for (const [deprecatedKey, currentKey] of Object.entries(renames)) {
    if (!currentKey || !(deprecatedKey in body)) continue;
    const carried = body[deprecatedKey];
    delete body[deprecatedKey];
    if (body[currentKey] === undefined) {
      body[currentKey] = carried;
    }
  }

  return body;
}

/**
 * Headers in the shape the API stores them: an array of name/value pairs, max 10.
 *
 * A record is converted, in insertion order. This is the one drifted field that was never silent —
 * `headers: { 'X-Api-Key': 'abc' }` failed `z.array(...)` and 400'd on every call that set it.
 */
export function endpointHeadersToWire(headers: EndpointHeadersInput): EndpointHeader[] {
  if (Array.isArray(headers)) return headers;
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

/**
 * Body for POST /api/webhook-endpoints and PATCH /api/webhook-endpoints/:id.
 *
 * Both take the same set of drifted keys, so both go through here. `applicationId` is added by the
 * resource on create.
 */
export function endpointRequestBody(
  input: CreateEndpointInput | UpdateEndpointInput
): Record<string, unknown> {
  const body = toRequestBody(input, ENDPOINT_STALE_KEYS, ENDPOINT_RENAMES);

  if (body.headers !== undefined) {
    body.headers = endpointHeadersToWire(body.headers as EndpointHeadersInput);
  }

  return body;
}

/**
 * A slug derived from a destination's name, matching `^[a-z0-9-]+$` and at most 50 characters.
 *
 * The API requires `slug` on create; this SDK has always had it optional, so every call that left
 * it out was a 400. Deriving one keeps those calls working. Accents are folded first, so `Café EU`
 * gives `cafe-eu` rather than `caf-eu`.
 *
 * @throws HookbaseError if the name has no alphanumeric characters to derive from.
 */
export function deriveDestinationSlug(name: string): string {
  const slug = name
    .replace(SLUG_FOLD_ADDITIONS, (char) =>
      char === '\u{A7F1}' ? 'S' : SLUG_FOLD_ALPHABET[char.codePointAt(0)! - 0x1ccd6]
    )
    .normalize('NFKD')
    // Combining marks left behind by the decomposition above, so é becomes e, not e + mark.
    // The whole Mn category, not just the U+0300-U+036F block: a mark outside that block (Arabic,
    // Hebrew, Devanagari) would otherwise survive to become a hyphen here while the Python and
    // .NET SDKs, which drop the category, removed it -- the same name would slug differently
    // depending on which SDK created the destination.
    .replace(SLUG_MARKS, (mark) => (mark === SLUG_MARK_RECLASSIFIED ? mark : ''))
    .toLowerCase()
    // Any run of non-alphanumerics becomes a single hyphen, which is the collapse step as well.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    // Truncation can land mid-word and leave a trailing hyphen behind.
    .replace(/-+$/, '');

  if (!slug) {
    throw new HookbaseError(
      `Cannot derive a destination slug from name ${JSON.stringify(name)}: pass ` +
        '`slug` explicitly, as a string matching ^[a-z0-9-]+$ (max 50 characters).'
    );
  }

  return slug;
}

/**
 * Body for POST /api/api-keys, converting the expiry from days to the seconds the API reads.
 *
 * The route takes `expiresIn` in **seconds** and destructures it off the body directly -- there is
 * no schema on that endpoint, so an `expiresInDays` key was neither read nor refused. The request
 * returned 201 and the key was created with no expiry at all: a caller who asked for a 90-day key
 * got a permanent one, and nothing in the response said so.
 *
 * Days stay the SDK's input unit rather than being renamed to seconds. `expiresInDays` is a real
 * API field on portal tokens, so the name is not wrong here, just the unit -- and the CLI has
 * always done this same conversion (`cli/src/lib/api.ts`).
 */
export function createApiKeyBody(input: CreateApiKeyInput): Record<string, unknown> {
  const { expiresInDays, ...rest } = input;
  const body: Record<string, unknown> = { ...rest };

  if (expiresInDays !== undefined) {
    body.expiresIn = expiresInDays * 24 * 60 * 60;
  }

  return body;
}

/** Body for POST /api/destinations. Fills in `slug` when the caller left it out. */
export function createDestinationBody(input: CreateDestinationInput): Record<string, unknown> {
  const body = toRequestBody(input, DESTINATION_STALE_KEYS, DESTINATION_RENAMES);

  const slug = body.slug;
  if (slug === undefined || (typeof slug === 'string' && slug.trim() === '')) {
    body.slug = deriveDestinationSlug(input.name);
  }

  return body;
}

/** Body for PATCH /api/destinations/:id. A destination's slug cannot be changed, so none is added. */
export function updateDestinationBody(input: UpdateDestinationInput): Record<string, unknown> {
  return toRequestBody(input, DESTINATION_STALE_KEYS, DESTINATION_RENAMES);
}

/**
 * Fill in `Application.uid` from the `externalId` the API actually sends.
 *
 * This is the one place the drift ran the other way. `Application` declared `uid: string`, the API
 * has never sent a key by that name, and nothing mapped between them — so the property was typed
 * as a present string while being `undefined` at runtime, and tsc had no complaint to make about
 * code that read it. Every other SDK does the same mirroring (python in a model validator, go in
 * UnmarshalJSON), so `uid` keeps working everywhere while `externalId` is the name to read.
 *
 * Mutates and returns the same object rather than spreading into a copy, so a field the API adds
 * later still reaches the caller without this function knowing about it.
 */
export function withApplicationAliases<T extends Application>(application: T): T {
  application.uid = application.externalId;
  return application;
}

/**
 * Normalise an endpoint response.
 *
 * Two pieces of long-standing drift, both invisible to tsc because the declared types said the
 * opposite of what arrived:
 *
 *  - `headers` is an array of `{name, value}` on the wire (and `[]` when empty), while `Endpoint`
 *    has always declared a `Record<string, string>`. So `endpoint.headers['X-Tenant']` type-checked
 *    and was `undefined` at runtime. The array is kept on `headerList` and folded into the record,
 *    in arrival order, which is what python's model validator does with the same response.
 *  - `filterTypes`, `rateLimit`, `rateLimitPeriod` and `metadata` are declared non-optional and the
 *    API has no such columns. They are filled with null so reading them yields the documented
 *    "always null" rather than `undefined`.
 *
 * Mutates and returns the same object, so a field the API adds later still reaches the caller.
 */
export function withEndpointAliases<T extends Endpoint>(endpoint: T): T {
  const wire = endpoint as unknown as { headers?: unknown };
  const list = Array.isArray(wire.headers) ? (wire.headers as EndpointHeader[]) : [];
  endpoint.headerList = list;
  if (Array.isArray(wire.headers)) {
    const record: Record<string, string> = {};
    for (const header of list) {
      if (header && typeof header.name === 'string') record[header.name] = String(header.value ?? '');
    }
    endpoint.headers = record;
  }
  endpoint.filterTypes ??= null;
  endpoint.rateLimit ??= null;
  endpoint.rateLimitPeriod ??= null;
  endpoint.metadata ??= null;
  return endpoint;
}
