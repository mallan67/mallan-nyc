import { NextResponse } from 'next/server';
import { hasCredentials } from '@/lib/idx/auth';
import { fetchFromTrestle } from '@/lib/idx/fetch';
import { checkDistributionGates, IDX_PLUS_SELECT_FIELDS } from '@/lib/idx/trestle-mapper';
import { mapRESOToInternal } from '@/lib/idx/mapping';
import { toPublicDTO } from '@/lib/idx/public-dto';

/**
 * GET /api/listings/diag — temporary diagnostic endpoint.
 * Tests FULL Trestle pipeline step by step. DELETE after verified.
 */
export async function GET() {
  const diag: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    idxEnabled: process.env.IDX_ENABLED,
    hasCredentials: hasCredentials(),
    trestleUrl: process.env.TRESTLE_API_URL ? 'SET' : 'NOT_SET',
    selectFieldCount: IDX_PLUS_SELECT_FIELDS.length,
  };

  // Step 1: fetchFromTrestle (full 297-field query)
  let records: Record<string, unknown>[] = [];
  try {
    const result = await fetchFromTrestle({
      filter: "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')",
      top: 3,
    });
    records = result.records;
    diag.step1_fetch = { ok: true, count: records.length, totalFetched: result.totalFetched };
  } catch (e) {
    diag.step1_fetch = { ok: false, error: e instanceof Error ? e.message : String(e) };
    return NextResponse.json(diag, { status: 500 });
  }

  // Step 2: checkDistributionGates
  try {
    const gated = records.map(r => ({ id: r.ListingId, ...checkDistributionGates(r) }));
    const displayable = records.filter(r => checkDistributionGates(r).displayable);
    diag.step2_gates = { ok: true, results: gated, displayableCount: displayable.length };
    records = displayable;
  } catch (e) {
    diag.step2_gates = { ok: false, error: e instanceof Error ? e.message : String(e) };
    return NextResponse.json(diag, { status: 500 });
  }

  // Step 3: mapRESOToInternal
  try {
    const mapped = records.map(r => mapRESOToInternal(r));
    const valid = mapped.filter((l): l is NonNullable<typeof l> => l !== null);
    diag.step3_map = { ok: true, mappedCount: valid.length, nullCount: mapped.length - valid.length };
    // Step 4: toPublicDTO
    try {
      const dtos = valid.map(l => toPublicDTO(l));
      diag.step4_dto = { ok: true, count: dtos.length };
      diag.sampleDTO = dtos[0] || null;
    } catch (e) {
      diag.step4_dto = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  } catch (e) {
    diag.step3_map = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json(diag, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
