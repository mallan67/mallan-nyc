/// <reference types="jest" />
/**
 * THE BROWSER RESOLVER, EXECUTED — NOT THE SERVER STANDING IN FOR IT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * The server resolver returns null for a bare ambiguous name, so `Bay Terrace`
 * cannot silently mean Queens or Staten Island. The browser resolver looped over
 * the identities and returned the FIRST whose label or raw spelling matched — and
 * both Bay Terrace identities carry the raw spelling `Bay Terrace`, so it returned
 * one of them.
 *
 * Two resolvers, two answers, and the Map and Saved Search both run the browser
 * one. A legacy polygon or a stored criterion reading simply `Bay Terrace` was
 * therefore silently migrated into whichever record happened to come first.
 *
 * Every existing test proved the SERVER behaviour and used `identityFor()` as the
 * semantic check for Map, so all five workflows stayed green while the runtime
 * answered differently. That is the anti-loop failure the project's
 * behavioural-proof rule exists to stop: a green test for one algorithm while
 * production runs another.
 *
 * So this file loads the real `neighborhood-autocomplete.js` in jsdom, feeds it
 * the real generated vocabulary, and calls `window.MallanNeighborhoods` — the
 * exact object the Map and Saved Search call.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { identityFor, identitiesFor } from '@/lib/search/canonical/subdivision-vocabulary.generated';

const REPO = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

const VOCAB = JSON.parse(read('public/crm/data/neighborhood-vocabulary.generated.json'));

interface Identity {
  label: string;
  borough: string;
  boroughLabel: string;
  spellings: string[];
  offered: boolean;
}
interface ResolveState {
  state: 'ok' | 'unknown' | 'ambiguous';
  identity: Identity | null;
  candidates: Identity[];
}
interface Vocab {
  state(): string;
  candidates(name: string): Identity[];
  resolveState(name: string, borough?: string): ResolveState;
  resolve(name: string, borough?: string): Identity | null;
  boroughFor(name: string): string;
  boroughLabel(providerValue: string): string;
}

/**
 * Run the SHIPPED module with a stubbed fetch that serves the real generated
 * vocabulary, then hand back the live `window.MallanNeighborhoods`.
 */
async function loadRealModule(): Promise<Vocab> {
  const listeners: Record<string, Array<() => void>> = {};
  const win: Record<string, unknown> = {};
  const sandbox: Record<string, unknown> = {
    window: win,
    console,
    CustomEvent: class { constructor(public type: string) {} },
    document: {
      dispatchEvent: (e: { type: string }) => (listeners[e.type] ?? []).forEach((f) => f()),
      addEventListener: (t: string, f: () => void) => { (listeners[t] ??= []).push(f); },
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    fetch: (url: string) => {
      // GUARD THE GUARD: the module must ask for the absolute CRM data path. If it
      // asked for anything else the stub would not fire and every case below would
      // pass vacuously against an empty vocabulary.
      expect(url).toBe('/crm/data/neighborhood-vocabulary.generated.json');
      return Promise.resolve({ ok: true, json: () => Promise.resolve(VOCAB) });
    },
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('public/crm/js/search/neighborhood-autocomplete.js'), sandbox);

  // Let the fetch promise settle.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  const vocab = win.MallanNeighborhoods as Vocab | undefined;
  if (!vocab) throw new Error('the module did not expose window.MallanNeighborhoods');
  return vocab;
}

describe('the browser resolver behaves exactly like the server resolver', () => {
  let vocab: Vocab;
  beforeAll(async () => { vocab = await loadRealModule(); });

  it('actually loaded the real vocabulary', () => {
    // Without this every assertion below could pass against an empty list.
    expect(vocab.state()).toBe('ready');
    expect(vocab.candidates('Tribeca').length).toBe(1);
  });

  it('BARE Bay Terrace is AMBIGUOUS in the browser, as it is on the server', () => {
    const r = vocab.resolveState('Bay Terrace');
    expect(r.state).toBe('ambiguous');
    expect(r.identity).toBeNull();
    expect(r.candidates.map((c) => c.label).sort()).toEqual([
      'Bay Terrace, Queens', 'Bay Terrace, Staten Island',
    ]);
    // The server agrees — that agreement is the invariant.
    expect(identityFor('Bay Terrace')).toBeNull();
    expect(identitiesFor('Bay Terrace').length).toBe(2);
  });

  it('and resolve() returns nothing rather than picking the first record', () => {
    // The exact defect: both identities carry the raw spelling `Bay Terrace`, and
    // the old loop returned whichever came first in the JSON.
    expect(vocab.resolve('Bay Terrace')).toBeNull();
  });

  it('a QUALIFIED label resolves to its own borough, both sides', () => {
    for (const [label, borough] of [
      ['Bay Terrace, Queens', 'Queens'],
      ['Bay Terrace, Staten Island', 'StatenIsland'],
    ] as const) {
      const r = vocab.resolveState(label);
      expect(`${label}:${r.state}`).toBe(`${label}:ok`);
      expect(`${label}:${r.identity!.borough}`).toBe(`${label}:${borough}`);
      expect(`${label}:${identityFor(label)?.borough}`).toBe(`${label}:${borough}`);
    }
  });

  it('an explicit borough disambiguates a bare name', () => {
    expect(vocab.resolveState('Bay Terrace', 'Queens').identity?.borough).toBe('Queens');
    expect(vocab.resolveState('Bay Terrace', 'Staten Island').identity?.borough).toBe('StatenIsland');
    // …and the broker LABEL works as well as the provider value, because that is
    // what the UI holds.
    expect(vocab.resolveState('Bay Terrace', 'StatenIsland').identity?.borough).toBe('StatenIsland');
  });

  it('an unknown name is UNKNOWN, not ambiguous — different problems', () => {
    const r = vocab.resolveState('Nonexistent Heights');
    expect(r.state).toBe('unknown');
    expect(r.candidates).toEqual([]);
  });

  it('case variants still collapse to one identity in the browser', () => {
    for (const spelling of ['SoHo', 'Soho', 'SOHO', 'soho']) {
      const r = vocab.resolveState(spelling);
      expect(`${spelling}:${r.state}`).toBe(`${spelling}:ok`);
      expect(`${spelling}:${r.identity!.label}`).toBe(`${spelling}:SoHo`);
    }
  });

  it('browser and server agree on EVERY identity label — no drift anywhere', () => {
    // The invariant stated as a sweep rather than as examples. Any label where the
    // two resolvers disagree is a place the UI and the executor mean different
    // things.
    const disagree: string[] = [];
    for (const i of VOCAB.identities as Identity[]) {
      const b = vocab.resolveState(i.label);
      const s = identityFor(i.label);
      const browserBorough = b.identity ? b.identity.borough : null;
      const serverBorough = s ? s.borough : null;
      if (browserBorough !== serverBorough) {
        disagree.push(`${i.label}: browser=${browserBorough} server=${serverBorough}`);
      }
    }
    expect(disagree).toEqual([]);
  });

  it('and they agree on raw provider spellings too, including ambiguous ones', () => {
    const spellings = new Set<string>();
    for (const i of VOCAB.identities as Identity[]) i.spellings.forEach((s) => spellings.add(s));
    const disagree: string[] = [];
    for (const s of spellings) {
      const browser = vocab.resolveState(s).identity?.label ?? null;
      const server = identityFor(s)?.label ?? null;
      if (browser !== server) disagree.push(`${s}: browser=${browser} server=${server}`);
    }
    expect(disagree).toEqual([]);
  });

  it('Mott Haven is the Bronx and Marble Hill is Manhattan, in the browser too', () => {
    // Marble Hill is the case a count-based rule gets wrong: the feed shows
    // Bronx 58 / Manhattan 12 and it is legally Manhattan.
    expect(vocab.boroughFor('Mott Haven')).toBe('Bronx');
    expect(vocab.boroughFor('Marble Hill')).toBe('Manhattan');
  });

  it('the borough LABEL is never the raw provider value', () => {
    expect(vocab.boroughLabel('StatenIsland')).toBe('Staten Island');
  });
});
