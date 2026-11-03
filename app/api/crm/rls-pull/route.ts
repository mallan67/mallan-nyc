// Pull a Mallan listing's property facts from Cotality by its RLS ID, for the Sale form. Read-only toward Cotality; writes nothing.
//
// Identifiers (kept apart on purpose, so nobody chases a phantom): the RLS ID is the listing's Cotality `ListingId` (e.g. RLS20123633), assigned by the provider and never typed into
// a Mallan listing by hand or invented. The SL ID (SL-0009) is Mallan's own. `ListingKey` (e.g. 1194314473) is a DIFFERENT Cotality identifier and is never used in place of the RLS ID. Office ownership is checked on `ListOfficeMlsId`
// (Mallan = lib/listings/mallan-source-identity MALLAN_LIST_OFFICE_MLS_IDS), never on a company-name string. A listing of another office is refused.
//
// What comes back is the listing's PROPERTY FACTS under their Cotality names (the names the Sale form already restores from a saved listing), with the REBNY custom keys
// (CustomProperty.CustomFields) flattened in. Everything that is the provider's own is withheld and listed in `skipped`: identity, status, permissions, display flags, agent/office,
// timestamps, media and tour links. Nothing is defaulted: a field Cotality has no value for is simply absent.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';
import { sanitizeOData } from '@/lib/sanitize';
import { getAccessToken } from '@/lib/idx/auth';
import { MALLAN_LIST_OFFICE_MLS_IDS } from '@/lib/listings/mallan-source-identity';
import { parseCustomFields } from '@/lib/search/crm-idx-filter';

const COTALITY_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

const RLS_ID = /^RLS\d{6,12}$/;

// The provider's own data: never copied into the Mallan listing (Master: source-owned data stays source-owned).
const WITHHELD: Array<{ test: RegExp; reason: string }> = [
  { test: /^(ListingId|ListingKey|ListingKeyNumeric|OriginatingSystem\w*|SourceSystem\w*|UniversalPropertyId|UniversalParcelId)$/, reason: 'the provider\'s identity for this listing (kept as the RLS link, never copied)' },
  { test: /^(StandardStatus|MlsStatus|ContractStatusChangeDate|MajorChangeType|MajorChangeTimestamp|StatusChangeTimestamp|OnMarketTimestamp|PriceChangeTimestamp|ModificationTimestamp)$/, reason: 'the provider\'s status and change history (the Mallan listing has its own status, starting as Draft)' },
  { test: /^(Permission|HumanModifiedYN|RecordSignature|Internet\w+YN|Internet\w+)$/, reason: 'provider permissions and display flags (Mallan decides its own display)' },
  { test: /^(ListAgent\w*|ListOffice\w*|CoListAgent\w*|CoListOffice\w*|BuyerAgent\w*|BuyerOffice\w*|ActivationDate)$/, reason: 'agent, office and Coming Soon activation (set by the Mallan form itself)' },
  { test: /^(Photos\w*|Documents\w*|Videos\w*|Media\w*|VirtualTour\w*)$/, reason: 'media and tour links stay with the provider (add Mallan\'s own media in the Media window)' },
];

const rateLimit = new Map<string, { count: number; resetAt: number }>();
function allowed(ip: string): boolean {
  const now = Date.now();
  const e = rateLimit.get(ip);
  if (!e || now > e.resetAt) { rateLimit.set(ip, { count: 1, resetAt: now + 60_000 }); return true; }
  e.count += 1;
  return e.count <= 10;
}

export async function GET(request: NextRequest) {
  const auth = await requireAgentOrBroker(request);
  if (isAuthError(auth)) return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (!allowed(ip)) return NextResponse.json({ error: 'Too many lookups. Wait a minute and try again.' }, { status: 429 });

  const rls = (request.nextUrl.searchParams.get('rlsId') ?? '').trim().toUpperCase();
  if (!RLS_ID.test(rls)) {
    return NextResponse.json({ error: 'That is not an RLS ID. It looks like RLS20123633.' }, { status: 400 });
  }

  // A Mallan listing already linked to this RLS ID is opened, never duplicated.
  const linked = await prisma.listing.findFirst({
    where: { listing_id: { startsWith: 'SL-' }, raw_data: { path: ['saleRlsId'], equals: rls } },
    select: { id: true, listing_id: true },
  });
  if (linked) {
    return NextResponse.json({ existing: { id: String(linked.id), listing_id: linked.listing_id }, rls: { listing_id: rls } });
  }

  try {
    const token = await getAccessToken();
    const params = new URLSearchParams({ $filter: `ListingId eq '${sanitizeOData(rls)}'`, $top: '2' });
    params.set('$expand', 'CustomProperty($select=CustomFields,ListingKey)');
    const res = await fetch(`${COTALITY_URL}/odata/Property?${params}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ error: 'Cotality could not be reached right now. Try again in a minute.' }, { status: 502 });
    const rows: Array<Record<string, unknown>> = (await res.json()).value ?? [];
    const rec = rows.find((r) => String(r.ListingId ?? '').toUpperCase() === rls);
    if (!rec) return NextResponse.json({ error: `Cotality has no listing with the RLS ID ${rls}.` }, { status: 404 });
    if (rows.filter((r) => String(r.ListingId ?? '').toUpperCase() === rls).length > 1) {
      return NextResponse.json({ error: `More than one Cotality record answers to the RLS ID ${rls}; it cannot be pulled safely.` }, { status: 409 });
    }

    const office = String(rec.ListOfficeMlsId ?? '').trim();
    if (!(MALLAN_LIST_OFFICE_MLS_IDS as readonly string[]).includes(office)) {
      return NextResponse.json({ error: `${rls} is not a Mallan listing (listing office ${office || 'unknown'}), so it cannot be pulled into a Mallan listing.` }, { status: 403 });
    }

    const custom = parseCustomFields(rec);
    const merged: Record<string, unknown> = { ...custom, ...rec };      // a Property column wins over a custom key of the same name
    delete merged.CustomProperty;
    const record: Record<string, unknown> = {};
    const skipped: Array<{ field: string; reason: string }> = [];
    for (const [field, value] of Object.entries(merged)) {
      if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
      const why = WITHHELD.find((w) => w.test.test(field));
      if (why) skipped.push({ field, reason: why.reason });
      else record[field] = value;
    }

    return NextResponse.json({
      rls: { listing_id: rls, listing_key: String(rec.ListingKey ?? ''), status: String(rec.StandardStatus ?? ''), list_office_mls_id: office },
      record,
      skipped,
    });
  } catch (err) {
    console.error('[rls-pull] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Cotality could not be reached right now. Try again in a minute.' }, { status: 502 });
  }
}
