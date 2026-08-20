/// <reference types="jest" />
/**
 * CANCELLATION DATE — THE CRM CHAIN THAT FEEDS CF-CANCELLED-001 (2026-08-20)
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * `REBNY_FIELD_TABLES.conditionalRules` rule `CANCELLED-001` is a BLOCKER:
 * a cancel-class `MlsStatus` requires a non-empty `CancellationDate`. HEAD
 * 4497eb5b closed that rule over BOTH spellings of the cancel class
 * (`Canceled` — the live Cotality member — and `Cancelled` — the Mallan CRM
 * canonical, `lib/crm/status-mapping.ts` CANONICAL_STATUSES), so it now fires
 * for the spelling `public/crm/SALE-FORM-REDESIGN.html` actually emits.
 *
 * Closing it exposed the real gap: NO Mallan form collected `CancellationDate`.
 * `public/crm/SALE-FORM-REDESIGN.html` has the full chain for its sibling
 * `OffMarketDate` — input, visibility wiring, status→required map, canonical
 * payload assembly, required-field registry, `SALE_FIELD_MAP` hydration — and
 * NONE of it for `CancellationDate`. So the payload the form POSTs when an
 * agent picks the `Cancelled` workflow status can never satisfy the blocker,
 * and the create path 422s with no field for the agent to fill.
 *
 * ── WHAT THIS FILE ASSERTS ────────────────────────────────────────────────
 * Every link is read OUT OF THE FORM SOURCE, not hand-typed here, so the test
 * fails if any single link is dropped later. The payload fed to the real gate
 * is ASSEMBLED FROM the form's own parsed maps — it is the form's shape, not a
 * convenient one. Negative controls prove the blocker was not weakened.
 *
 * ── WHAT THIS FILE DOES *NOT* CLAIM ───────────────────────────────────────
 * It does not claim an agent can complete a cancellation end to end. The
 * status route's own state machine
 * (`app/api/crm/listings/[id]/status/route.ts` STATUS_TRANSITIONS) lists NO
 * transition INTO `Cancelled`/`Canceled` from any state, so that leg 422s for
 * a separate reason this file deliberately does not touch. Pinned in §5 as a
 * REVEALED, UNFIXED defect so it cannot be quietly forgotten.
 */
import { readFileSync } from 'fs';
import * as path from 'path';

import { REBNY_FIELD_TABLES } from '@/lib/compliance/rebny-field-tables';
import { assertRlsCompliantPayload } from '@/lib/compliance/rls-enforcement';
import { normalizePayload, buildPersistenceRecord } from '@/lib/compliance/normalizer';
import { statusSpellings } from '@/lib/compliance/listing-status-vocabulary';
import { STATUS_TRANSITIONS } from '@/app/api/crm/listings/[id]/status/route';

const FORM_PATH = path.resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const src = readFileSync(FORM_PATH, 'utf-8');

/** Both stored spellings of the cancel state — from the shared vocabulary. */
const CANCEL_SPELLINGS = statusSpellings('Cancelled');

/** The CRM workflow token the sale form's own select offers for cancelling. */
const CRM_CANCEL_TOKEN = 'Cancelled';

// ─── Parsers over the real form source ──────────────────────────────────────

function objectLiteral(name: string): Record<string, string[]> {
  const m = src.match(new RegExp(`(?:const|var)\\s+${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!m) throw new Error(`${name} not found in ${FORM_PATH}`);
  const out: Record<string, string[]> = {};
  const entry = /'([^']+)'\s*:\s*\[([^\]]*)\]/g;
  let e: RegExpExecArray | null;
  while ((e = entry.exec(m[1])) !== null) {
    out[e[1]] = (e[2].match(/'([^']*)'/g) || []).map((s) => s.slice(1, -1));
  }
  return out;
}

/** CRM workflow token → canonical RESO MlsStatus, read from the form. */
function crmToReso(): Record<string, string> {
  const m = src.match(/const\s+CRM_TO_RESO_STATUS\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) throw new Error('CRM_TO_RESO_STATUS not found');
  const out: Record<string, string> = {};
  const pair = /'([^']+)'\s*:\s*'([^']+)'/g;
  let p: RegExpExecArray | null;
  while ((p = pair.exec(m[1])) !== null) out[p[1]] = p[2];
  return out;
}

/** `data.<Canonical> = data.<saleFormId> || ''` assignments in the collector. */
function canonicalAssignments(): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /data\.([A-Z][A-Za-z0-9]*)\s*=\s*data\.(sale[A-Za-z0-9]*)\s*\|\|/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out[m[1]] = m[2];
  return out;
}

/** `SALE_FIELD_MAP` hydration entries. */
function saleFieldMap(): Array<Record<string, string>> {
  const m = src.match(/var\s+SALE_FIELD_MAP\s*=\s*\[([\s\S]*?)\n\];/);
  if (!m) throw new Error('SALE_FIELD_MAP not found');
  return (m[1].match(/\{[^}]+\}/g) || []).map((raw) => {
    const o: Record<string, string> = {};
    const kv = /(\w+)\s*:\s*'([^']*)'/g;
    let k: RegExpExecArray | null;
    while ((k = kv.exec(raw)) !== null) o[k[1]] = k[2];
    return o;
  });
}

/** `SALE_REQUIRED_FIELDS` registry entries (id + statusOnly closure). */
function saleRequiredFieldsRegistry(): Array<{ id: string; statusOnly: string[] }> {
  const m = src.match(/const\s+SALE_REQUIRED_FIELDS\s*=\s*\[([\s\S]*?)\n\];/);
  if (!m) throw new Error('SALE_REQUIRED_FIELDS not found');
  return (m[1].match(/\{[^}]+\}/g) || []).map((raw) => ({
    id: (raw.match(/id:\s*'([^']+)'/) || [, ''])[1] as string,
    statusOnly: ((raw.match(/statusOnly:\s*\[([^\]]*)\]/) || [, ''])[1].match(/'([^']*)'/g) || []).map(
      (s) => s.slice(1, -1),
    ),
  }));
}

/** The body of `updateSaleStatusFields()` — the wrapper show/hide wiring. */
function statusHandlerBody(): string {
  const m = src.match(/function\s+updateSaleStatusFields\(\)\s*\{([\s\S]*?)\n\}/);
  if (!m) throw new Error('updateSaleStatusFields not found');
  return m[1];
}

// ═══════════════════════════════════════════════════════════════════════════
// 0. PREMISES — if these drift, every assertion below is measuring nothing
// ═══════════════════════════════════════════════════════════════════════════

describe('premises', () => {
  it('the cancel spelling class carries both stored spellings', () => {
    expect(CANCEL_SPELLINGS.slice().sort()).toEqual(['Canceled', 'Cancelled']);
  });

  it("the form's cancel workflow token maps to a cancel-class MlsStatus", () => {
    expect(CANCEL_SPELLINGS).toContain(crmToReso()[CRM_CANCEL_TOKEN]);
  });

  it('CANCELLED-001 still requires CancellationDate for both spellings', () => {
    const rule = (
      REBNY_FIELD_TABLES.conditionalRules as ReadonlyArray<{
        code: string;
        appliesWhen: Record<string, unknown>;
        requireFields: readonly string[];
      }>
    ).find((r) => r.code === 'CANCELLED-001');
    expect(rule).toBeDefined();
    expect(rule!.requireFields).toContain('CancellationDate');
    expect(rule!.appliesWhen.MlsStatus as string[]).toEqual(expect.arrayContaining(CANCEL_SPELLINGS));
  });

  it('CancellationDate persists to raw_data only — no typed column, no migration', () => {
    const pMap = REBNY_FIELD_TABLES.persistenceMap as Record<string, Record<string, unknown>>;
    expect(pMap.CancellationDate).toEqual({ raw: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. THE CHAIN — every link the OffMarketDate precedent has
// ═══════════════════════════════════════════════════════════════════════════

describe('SALE-FORM-REDESIGN.html collects CancellationDate', () => {
  it('link 1 — a date input bound to the canonical RLS field', () => {
    const input = src.match(/<input[^>]*id="saleCancellationDate"[^>]*>/);
    expect(input).not.toBeNull();
    expect(input![0]).toContain('type="date"');
    expect(input![0]).toContain('data-rls-field="CancellationDate"');
  });

  it('link 2 — a wrapper revealed by the status handler for the CRM cancel token', () => {
    expect(src).toContain('id="saleCancellationDateField"');
    const body = statusHandlerBody();
    // Resolved…
    expect(body).toMatch(/const\s+(\w+)\s*=\s*document\.getElementById\('saleCancellationDateField'\)/);
    const handle = body.match(/const\s+(\w+)\s*=\s*document\.getElementById\('saleCancellationDateField'\)/)![1];
    // …hidden by default (fail-closed: never left visible from a prior status)…
    expect(body).toMatch(new RegExp(`if\\s*\\(${handle}\\)\\s*${handle}\\.style\\.display\\s*=\\s*'none'`));
    // …and revealed only under a branch keyed on the CRM's own cancel token.
    expect(body).toMatch(
      new RegExp(
        `\\[[^\\]]*'${CRM_CANCEL_TOKEN}'[^\\]]*\\]\\.includes\\(status\\)\\)[\\s\\S]{0,300}?${handle}\\.style\\.display\\s*=\\s*''`,
      ),
    );
  });

  it('link 3 — STATUS_REQUIRED_FIELDS makes it required for the cancel token', () => {
    const required = objectLiteral('STATUS_REQUIRED_FIELDS');
    expect(required[CRM_CANCEL_TOKEN]).toBeDefined();
    expect(required[CRM_CANCEL_TOKEN]).toContain('saleCancellationDate');
    // Cancelled is also an OFFMARKET-001 status, so the same entry must carry
    // the OffMarketDate input or the agent still cannot clear the gate.
    expect(required[CRM_CANCEL_TOKEN]).toContain('saleOffMarketDate');
  });

  it('link 4 — the collector maps the input onto canonical CancellationDate', () => {
    expect(canonicalAssignments().CancellationDate).toBe('saleCancellationDate');
  });

  it('link 5 — the required-field registry lists it, status-scoped to the cancel token', () => {
    const entry = saleRequiredFieldsRegistry().find((f) => f.id === 'saleCancellationDate');
    expect(entry).toBeDefined();
    expect(entry!.statusOnly).toContain(CRM_CANCEL_TOKEN);
  });

  it('link 6 — SALE_FIELD_MAP hydrates it back from raw_data on edit-load', () => {
    const entry = saleFieldMap().find((f) => f.rls === 'CancellationDate');
    expect(entry).toEqual(
      expect.objectContaining({
        rls: 'CancellationDate',
        form: 'saleCancellationDate',
        type: 'date',
        src: 'raw',
      }),
    );
  });

  it('link 7 — edit-load re-runs the status gating, so the hydrated value is visible', () => {
    // `_populateSaleFormFromApi` restores saleStatus with
    // `window._salePopulateInProgress = true`, which suppresses the change event
    // the <select onchange> relies on — so `updateSaleStatusFields()` would never
    // fire and the wrapper would stay display:none with a hydrated value inside
    // it. The explicit re-run at the end of populate is what makes link 6 visible
    // to the agent rather than merely present in the DOM.
    expect(src).toMatch(
      /if\s*\(typeof updateSaleStatusFields === 'function'\)\s*updateSaleStatusFields\(\);/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. THE GATE — the form's own payload shape, through the real enforcement
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the canonical payload the form produces for a cancel, using ONLY the
 * form's parsed maps: every input STATUS_REQUIRED_FIELDS demands for the cancel
 * token, translated through the collector's own canonical assignments.
 */
function formCancelPayload(spelling: string, overrides: Record<string, unknown> = {}) {
  const requiredIds = objectLiteral('STATUS_REQUIRED_FIELDS')[CRM_CANCEL_TOKEN] ?? [];
  const idToCanonical = new Map(Object.entries(canonicalAssignments()).map(([rls, id]) => [id, rls]));
  const payload: Record<string, unknown> = { MlsStatus: spelling, ListPrice: 1_000_000 };
  for (const id of requiredIds) {
    const canonical = idToCanonical.get(id);
    if (canonical) payload[canonical] = '2026-08-01';
  }
  return { ...payload, ...overrides };
}

function blockerCodes(payload: Record<string, unknown>): string[] {
  return assertRlsCompliantPayload(payload, { listingType: 'sale' }).blockers.map((b) => b.code);
}

describe('the payload the cancel form produces clears the conditional blockers', () => {
  for (const spelling of CANCEL_SPELLINGS) {
    it(`'${spelling}' — neither CF-CANCELLED-001 nor CF-OFFMARKET-001 is raised`, () => {
      const payload = formCancelPayload(spelling);
      const codes = blockerCodes(payload);
      expect({
        spelling,
        CancellationDate: payload.CancellationDate,
        OffMarketDate: payload.OffMarketDate,
        cancelBlocked: codes.includes('CF-CANCELLED-001'),
        offMarketBlocked: codes.includes('CF-OFFMARKET-001'),
      }).toEqual({
        spelling,
        CancellationDate: '2026-08-01',
        OffMarketDate: '2026-08-01',
        cancelBlocked: false,
        offMarketBlocked: false,
      });
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. NEGATIVE CONTROLS — the BLOCKER stays fail-closed
// ═══════════════════════════════════════════════════════════════════════════

describe('CF-CANCELLED-001 is NOT weakened by supplying the input', () => {
  for (const spelling of CANCEL_SPELLINGS) {
    for (const [label, override] of [
      ['absent', { CancellationDate: undefined }],
      ['blank string', { CancellationDate: '' }],
      ['null', { CancellationDate: null }],
    ] as Array<[string, Record<string, unknown>]>) {
      it(`'${spelling}' with CancellationDate ${label} => BLOCKER still fires`, () => {
        const payload = formCancelPayload(spelling, override);
        if (override.CancellationDate === undefined) delete payload.CancellationDate;
        const raised = assertRlsCompliantPayload(payload, { listingType: 'sale' }).blockers.filter(
          (b) => b.code === 'CF-CANCELLED-001',
        );
        expect({ spelling, label, raised: raised.map((b) => ({ field: b.field, severity: b.severity })) }).toEqual({
          spelling,
          label,
          raised: [{ field: 'CancellationDate', severity: 'BLOCKER' }],
        });
      });
    }
  }

  it('a non-cancel status never raises CF-CANCELLED-001', () => {
    for (const s of ['Active', 'ComingSoon', 'Pending', 'Closed', 'Withdrawn', 'Expired', 'Hold']) {
      expect({
        s,
        raised: blockerCodes({ MlsStatus: s, OffMarketDate: '2026-08-01' }).includes('CF-CANCELLED-001'),
      }).toEqual({ s, raised: false });
    }
  });

  it('the sibling OFFMARKET-001 blocker is untouched for both spellings', () => {
    for (const spelling of CANCEL_SPELLINGS) {
      const payload = formCancelPayload(spelling);
      delete payload.OffMarketDate;
      expect({ spelling, raised: blockerCodes(payload).includes('CF-OFFMARKET-001') }).toEqual({
        spelling,
        raised: true,
      });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. ROUND TRIP — submitted → normalized → persisted in raw → hydrated back
// ═══════════════════════════════════════════════════════════════════════════

describe('CancellationDate survives the write/read round trip with no migration', () => {
  it('normalizePayload keeps the canonical key verbatim (not stripped, not aliased)', () => {
    const { normalized, stripped } = normalizePayload({
      MlsStatus: 'Cancelled',
      CancellationDate: '2026-08-01',
    });
    expect(stripped).not.toContain('CancellationDate');
    expect(normalized.CancellationDate).toBe('2026-08-01');
  });

  it('buildPersistenceRecord routes it to raw_data and to NO typed/structured bucket', () => {
    const { normalized } = normalizePayload({ MlsStatus: 'Cancelled', CancellationDate: '2026-08-01' });
    const p = buildPersistenceRecord(normalized);
    expect(p.raw_data.CancellationDate).toBe('2026-08-01');
    expect(p.topLevel).not.toHaveProperty('CancellationDate');
    expect(p.address).not.toHaveProperty('CancellationDate');
    expect(p.features).not.toHaveProperty('CancellationDate');
    expect(p.agentInfo).not.toHaveProperty('CancellationDate');
  });

  it('the hydration entry reads the exact key persistence wrote', () => {
    const { normalized } = normalizePayload({ CancellationDate: '2026-08-01T00:00:00Z' });
    const raw = buildPersistenceRecord(normalized).raw_data as Record<string, unknown>;
    const entry = saleFieldMap().find((f) => f.rls === 'CancellationDate')!;
    expect(entry.src).toBe('raw');
    // _populateSaleFormFromApi: `val = raw[f.rls]`, then date → split('T')[0].
    const hydrated = String(raw[entry.rls]).split('T')[0];
    expect({ form: entry.form, hydrated }).toEqual({ form: 'saleCancellationDate', hydrated: '2026-08-01' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. THE CANCEL STATE IS NOW REACHABLE — closed 2026-08-20
// ═══════════════════════════════════════════════════════════════════════════
//
// This block previously asserted `inbound === []` as a deliberate tripwire: the
// CancellationDate chain above was NECESSARY BUT NOT SUFFICIENT, because
// STATUS_TRANSITIONS had no inbound edge to the cancel class and
// `updateStatus(id, 'Cancelled')` returned HTTP 422 from every source state.
// The edges are now supplied, so the tripwire is replaced by the real contract.

describe('cancel state reachability — inbound edges, and terminality preserved', () => {
  const inboundFrom = () =>
    Object.entries(STATUS_TRANSITIONS)
      .filter(([, next]) => next.some((s) => CANCEL_SPELLINGS.includes(s)))
      .map(([from]) => from)
      .sort();

  it('every state holding a live or suspended agreement can reach the cancel class', () => {
    // Justification per state lives in the route's own comment block. These are
    // the states where a listing agreement exists and can therefore be ended.
    expect(inboundFrom()).toEqual(
      ['Active', 'ActiveUnderContract', 'ComingSoon', 'Expired', 'Hold', 'Pending', 'Withdrawn'].sort()
    );
  });

  it('BOTH stored spellings are reachable from every one of those states', () => {
    // The CRM writes `Cancelled`; mapTrestleToPrisma writes the provider member
    // `Canceled` verbatim. A row must be reachable under either spelling, or the
    // provider-spelled half of the class becomes a dead end again.
    for (const from of inboundFrom()) {
      const next = STATUS_TRANSITIONS[from];
      expect({ from, hasCancelled: next.includes('Cancelled'), hasCanceled: next.includes('Canceled') })
        .toEqual({ from, hasCancelled: true, hasCanceled: true });
    }
  });

  it('cancellation stays TERMINAL — neither spelling gains an outbound edge', () => {
    for (const spelling of CANCEL_SPELLINGS) {
      expect({ spelling, out: STATUS_TRANSITIONS[spelling] }).toEqual({ spelling, out: [] });
    }
  });

  it('pre-publication and completed states are NOT given a cancel edge', () => {
    // Draft/Incomplete have no filed agreement to cancel; Sold/Rented are closed
    // transactions; Delete is a provider tombstone. Widening any of these is a
    // product decision, not a bug fix — this pins the deliberate exclusions.
    for (const from of ['Draft', 'Incomplete', 'Sold', 'Rented', 'Delete']) {
      expect({ from, reaches: (STATUS_TRANSITIONS[from] ?? []).some((s) => CANCEL_SPELLINGS.includes(s)) })
        .toEqual({ from, reaches: false });
    }
  });

  it('the cancel targets are DERIVED from the shared class, not hand-typed', () => {
    // Regression pin for the defect class that caused the UCBA DOM-reset failure:
    // nine independent literals drifting apart. If someone re-types a literal and
    // omits a spelling, the both-spellings test above fails first.
    const targets = STATUS_TRANSITIONS.Active.filter((s) => CANCEL_SPELLINGS.includes(s));
    expect(new Set(targets)).toEqual(new Set(CANCEL_SPELLINGS));
  });
});
