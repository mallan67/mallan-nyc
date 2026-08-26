/// <reference types="jest" />
/**
 * REFUSAL_SERIALIZED_BUT_NOT_SURFACED.
 *
 * The transport failure family, running the other direction.
 *
 * Every other class in this workstream describes a criterion that fails to
 * reach the provider. This one describes the ANSWER failing to reach the
 * broker. The server does its job perfectly:
 *
 *     { error: "Unsupported search criterion.",
 *       code: "UNSUPPORTED_CRITERION",
 *       criterion: "managementCompany",
 *       unsupportedValues: ["Douglas Elliman"] }
 *
 * and the API client threw all of it away:
 *
 *     return Promise.reject(new Error(data.error || 'Request failed: ' + res.status));
 *
 * `criterion` and `unsupportedValues` — the only two fields that say what to
 * DO about it — never left that function. The search catch handler, having
 * nothing to work with, showed "Search failed — no results to show. Please try
 * again." Retrying is guaranteed to fail identically, so the one piece of
 * advice the broker received was the one action that could not work.
 *
 * This matters right now, not theoretically. `managementCompany` has four live
 * enabled text inputs in the served form, the serializer forwards it, and the
 * server refuses it BY NAME. So typing a management company today kills the
 * whole search with a generic error. The refusal is correct — Mallan will not
 * substitute ListOfficeName for a management company — but a correct refusal
 * nobody can read is operationally identical to a broken search.
 *
 * The fix is additive on purpose: the structured fields are ATTACHED to the
 * rejected Error. Every existing consumer reading `err.message` keeps working
 * unchanged.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';

const REPO = resolve(__dirname, '../..');
const apiClientSrc = readFileSync(resolve(REPO, 'public/crm/js/core/api-client.js'), 'utf8');
const engineSrc = readFileSync(resolve(REPO, 'public/crm/js/search/search-engine.js'), 'utf8');
const built = readFileSync(resolve(REPO, 'public/crm/index-built.html'), 'utf8');

/** The exact body app/api/idx/search/route.ts returns for a refused criterion. */
const REFUSAL_BODY = {
  error: 'Unsupported search criterion.',
  code: 'UNSUPPORTED_CRITERION',
  criterion: 'managementCompany',
  unsupportedValues: ['Douglas Elliman'],
};

/**
 * Run the real api-client IIFE against a stubbed fetch that answers with the
 * real refusal body, and return whatever it rejects with. This executes the
 * shipped error path rather than asserting on its source text.
 */
function rejectionFrom(status: number, body: unknown): Promise<any> {
  const sandbox: Record<string, unknown> = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: { removeItem() {}, getItem: () => null, setItem() {} },
    window: { dispatchEvent() {} },
    CustomEvent: class {
      constructor(public type: string) {}
    },
    Promise,
    Object,
    Error,
    JSON,
    encodeURIComponent,
    fetch: () =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
      }),
  };
  sandbox.globalThis = sandbox;
  runInNewContext(apiClientSrc + ';globalThis.__api = MallanAPI;', sandbox);
  const api = sandbox.__api as any;
  return api.idx.search({ managementCompany: 'Douglas Elliman' }).then(
    () => {
      throw new Error('expected the refusal to reject');
    },
    (err: any) => err,
  );
}

describe('the API client preserves the structured refusal', () => {
  it('keeps the human message it already had', async () => {
    // Additive change: nothing that reads err.message may regress.
    const err = await rejectionFrom(400, REFUSAL_BODY);
    expect(err.message).toBe('Unsupported search criterion.');
  });

  it('carries the machine-readable code', async () => {
    const err = await rejectionFrom(400, REFUSAL_BODY);
    expect(err.code).toBe('UNSUPPORTED_CRITERION');
  });

  it('carries WHICH criterion was refused', async () => {
    // The single most important field, and the one that was dropped.
    const err = await rejectionFrom(400, REFUSAL_BODY);
    expect(err.criterion).toBe('managementCompany');
  });

  it('carries the offending values', async () => {
    const err = await rejectionFrom(400, REFUSAL_BODY);
    expect(err.unsupportedValues).toEqual(['Douglas Elliman']);
  });

  it('carries the HTTP status so a caller can tell 400 from 500', async () => {
    // A refused criterion is permanent; a 500 is worth retrying. Collapsing
    // them is what produced "Please try again" for an unretryable failure.
    const err = await rejectionFrom(400, REFUSAL_BODY);
    expect(err.status).toBe(400);
  });

  it('still rejects usefully when the body is not JSON at all', async () => {
    // The pre-existing fallback must survive: a proxy or gateway can return
    // HTML, and losing the rejection entirely would be worse than losing detail.
    const sandbox: Record<string, unknown> = {
      console: { log() {}, warn() {}, error() {} },
      localStorage: { removeItem() {}, getItem: () => null, setItem() {} },
      window: { dispatchEvent() {} },
      CustomEvent: class {},
      Promise,
      Object,
      Error,
      JSON,
      encodeURIComponent,
      fetch: () =>
        Promise.resolve({
          ok: false,
          status: 502,
          json: () => Promise.reject(new SyntaxError('not json')),
        }),
    };
    sandbox.globalThis = sandbox;
    runInNewContext(apiClientSrc + ';globalThis.__api = MallanAPI;', sandbox);
    const err = await (sandbox.__api as any).idx.search({}).then(
      () => {
        throw new Error('expected a rejection');
      },
      (e: any) => e,
    );
    expect(String(err.message)).toContain('502');
  });
});

describe('the search failure path tells the broker what to actually do', () => {
  it('branches on the refusal code instead of treating every failure alike', () => {
    expect(engineSrc).toMatch(/UNSUPPORTED_CRITERION/);
  });

  it('names the refused criterion in what the broker sees', () => {
    const block = engineSrc.slice(engineSrc.indexOf("[Search] Search failed:"));
    expect(block).toMatch(/err\.criterion/);
  });

  it('does not tell the broker to retry a permanently refused criterion', () => {
    // "Please try again" must remain for genuine transient failures and must
    // NOT be what a refused criterion produces.
    const block = engineSrc.slice(
      engineSrc.indexOf("[Search] Search failed:"),
      engineSrc.indexOf('function quickSearch'),
    );
    const retryAdvice = block.indexOf('Please try again');
    const codeCheck = block.indexOf('UNSUPPORTED_CRITERION');
    expect(codeCheck).toBeGreaterThan(-1);
    expect(codeCheck).toBeLessThan(retryAdvice);
  });

  it('still fails closed — a refused search yields no result universe', () => {
    // The naming must not soften the existing guarantee: rows cleared,
    // provenance dropped, persisted state discarded.
    const block = engineSrc.slice(
      engineSrc.indexOf("[Search] Search failed:"),
      engineSrc.indexOf('function quickSearch'),
    );
    expect(block).toMatch(/_setResultProvenance\('none'\)/);
    expect(block).toMatch(/filteredListings = \[\]/);
  });
});

describe('the served artifact carries the same surfacing', () => {
  it('the built shell branches on the refusal code', () => {
    // A source-only fix does not reach /crm/search until the shell is rebuilt.
    expect(built).toMatch(/UNSUPPORTED_CRITERION/);
  });
});
