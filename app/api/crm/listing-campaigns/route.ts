// /api/crm/listing-campaigns — POST
//
// Create an investor / 1031-exchange email campaign FROM a listing record inside
// the CRM. The listing is hydrated through the SAME public DTO the website uses
// (`dbListingToPublicDTO`), so the media is floor-plan-safe by construction
// (photo-first via the shared `listing-media-resolver`) and the address / price /
// canonical URL match what a recipient sees on the public page.
//
// Compliance posture (grounded in canonical code, not memory):
//   • Distribution gate — a Mallan CRM exclusive (listing_id `SL-`/`RL-`) is NOT
//     gated by `idx_display_yn` / `internet_entire_listing_display_yn`. Those are
//     RLS/IDX *redistribution* gates for third-party inventory; `dbListingToPublicDTO`
//     renders CRM exclusives without them (see db-to-public-dto.ts:311-315 +
//     `classifyDbListing`). The gates that DO apply to a Mallan exclusive are
//     Owner Opt-Out, Participant-Only, and Terminal-Status (§2.05). A third-party
//     IDX row gets the full fail-closed 6-gate check.
//   • Fair Housing — every agent-composed free-text field (subject, headline,
//     intro, bullets, location blurb) is scanned before render/send. HTTP 422 on
//     any violation, before any delivery or audit write.
//   • CAN-SPAM (commercial email) — the investor blast is commercial, so each
//     recipient goes through `sendEmail`'s fail-closed suppression + signed
//     one-click List-Unsubscribe header. TCPA/consent is NOT required for email.
//   • No live delivery ships enabled: `live` mode is refused unless the
//     CAMPAIGN_LIVE_SEND_ENABLED env flag is explicitly set (fail-closed staging,
//     same pattern as LISTING_EVENTS_ENABLED). `preview`/`dry_run` never deliver.
//
// This route never imports contacts and — with the env flag unset — never sends.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { scanRecordForFairHousing } from "@/lib/compliance/rls-enforcement";
// `affirmPermission`, `TERMINAL_STATUSES` and `normalizeStandardStatus` are no
// longer imported here: the distribution decision now lives entirely inside
// `evaluateCampaignDistributionGate`, so this route holds no gate logic of its own.
import { evaluateCampaignDistributionGate } from "@/lib/compliance/campaign-distribution-gate";
import { dbListingToPublicDTO, type DbListing } from "@/lib/idx/db-to-public-dto";
import { investorListingEmail, type InvestorListingEmailData } from "@/lib/email/templates";
import { computeInvestmentMetrics, parseMoney } from "@/lib/email/investment-metrics";
import { sendEmail } from "@/lib/email/sendgrid";
import { escapeHtml } from "@/lib/sanitize";
import {
  filterSuppressedRecipients,
  type CampaignRecipient,
} from "@/lib/email/recipient-list";
import type { SessionUser } from "@/lib/auth/session";
import { PUBLIC_EXTERNAL_MEDIA_RELATION } from "@/lib/media/public-external-media-select";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://mallan.nyc";
const MAX_CAMPAIGN_RECIPIENTS = Number(process.env.CAMPAIGN_MAX_RECIPIENTS || "250");
const THROTTLE_MS = Number(process.env.CAMPAIGN_THROTTLE_MS || "250");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CampaignMode = "preview" | "dry_run" | "test" | "live";
const MODES: CampaignMode[] = ["preview", "dry_run", "test", "live"];

// Fields dbListingToPublicDTO + classifyDbListing read, plus the gate columns.
const LISTING_SELECT = {
  id: true,
  listing_id: true,
  mls_id: true,
  status: true,
  listing_type: true,
  property_type: true,
  property_sub_type: true,
  list_price: true,
  bedrooms_total: true,
  bathrooms_full: true,
  bathrooms_half: true,
  living_area: true,
  borough: true,
  neighborhood: true,
  address: true,
  features: true,
  media: true,
  list_agent_full_name: true,
  list_office_name: true,
  agent_id: true,
  owner_client_id: true,
  rls_eligible: true,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
  owner_opt_out: true,
  participant_only: true,
  listing_contract_date: true,
  modification_timestamp: true,
  created_at: true,
  updated_at: true,
  raw_data: true,
  listing_media: {
    where: { status: "active" },
    orderBy: [{ order: "asc" as const }, { id: "asc" as const }],
    select: {
      // MIXED-GALLERY COMPOSITION: resolveDbListingMedia treats an all-`crm:`
      // relational set as a SUPPLEMENT to the legacy Cotality feed JSON rather
      // than as the whole gallery. Without this column that case is
      // undetectable and one CRM upload hides the entire feed gallery.
      media_key: true,
      media_url_original: true,
      media_url_cached: true,
      media_type: true,
      media_category: true,
      media_classification: true,
      order: true,
      preferred_photo_yn: true,
      status: true,
    },
  },
  external_media: PUBLIC_EXTERNAL_MEDIA_RELATION,
  // All-status existence signal for the DTO's media authority (this select is
  // ACTIVE-only). Keeps "never imported" distinct from "all deleted" so a Mallan
  // exclusive's deleted photos are never resurrected from the legacy JSON — no
  // extra query / no N+1 (Codex review, 2026-07-16).
  _count: { select: { listing_media: true } },
} satisfies Prisma.ListingSelect;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Adapter so the pure, DB-free `filterSuppressedRecipients` (which types its db
// arg minimally for testability) accepts the real Prisma client without a
// parameter-variance clash.
const leadFinder = () => ({
  lead: {
    findMany: (args: unknown) =>
      prisma.lead.findMany(args as Prisma.LeadFindManyArgs) as unknown as Promise<{ email: string }[]>,
  },
});

/** Normalize + de-duplicate a recipient list server-side (never trust the client). */
function normalizeRecipients(raw: unknown): {
  clean: CampaignRecipient[];
  received: number;
  duplicate: number;
  invalid: number;
} {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const clean: CampaignRecipient[] = [];
  let duplicate = 0;
  let invalid = 0;
  for (const r of arr) {
    const email = String((r as { email?: unknown })?.email ?? "").trim().toLowerCase();
    const name = String((r as { name?: unknown })?.name ?? "").trim();
    if (!EMAIL_RE.test(email)) { invalid++; continue; }
    if (seen.has(email)) { duplicate++; continue; }
    seen.add(email);
    clean.push({ email, name: name || email.split("@")[0] });
  }
  return { clean, received: arr.length, duplicate, invalid };
}

export async function POST(req: NextRequest) {
  // Read-only guard first (blocks all writes when the site is in read-only mode).
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const listing_id = typeof body.listing_id === "string" ? body.listing_id : "";
  const mode = (typeof body.mode === "string" ? body.mode : "preview") as CampaignMode;
  if (!listing_id) {
    return NextResponse.json({ error: "listing_id is required" }, { status: 400 });
  }
  if (!MODES.includes(mode)) {
    return NextResponse.json({ error: `mode must be one of ${MODES.join(", ")}` }, { status: 400 });
  }

  // ── Hydrate the listing through the public DTO ──────────────────────────────
  const row = await prisma.listing.findUnique({
    where: { listing_id },
    select: LISTING_SELECT,
  });
  if (!row) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Prisma returns BigInt PKs; the DTO/classifier want string|null. Cast for the
  // shape the DTO expects (it only reads agent_id/owner_client_id via `!= null`).
  const dbListing = {
    ...row,
    id: String(row.id),
    agent_id: row.agent_id == null ? null : String(row.agent_id),
    owner_client_id: row.owner_client_id == null ? null : String(row.owner_client_id),
  } as unknown as DbListing;

  const dto = dbListingToPublicDTO(dbListing);

  // ── Distribution gate ───────────────────────────────────────────────────────
  // Delegates to the canonical pure gate. This previously keyed the IDX
  // redistribution checks off an `SL-`/`RL-` listing-id PREFIX, so an
  // RLS-ELIGIBLE Mallan exclusive skipped BOTH `idx_display_yn` and
  // `internet_entire_listing_display_yn` before distribution. A prefix is
  // provenance, not permission — the same fault corrected for address
  // suppression in lib/idx/db-to-public-dto.ts. The boundary is `rls_eligible`,
  // which this route already selects (LISTING_SELECT).
  const { blocks: gateBlocks } = evaluateCampaignDistributionGate({
    listing_id,
    rls_eligible: row.rls_eligible,
    idx_display_yn: row.idx_display_yn,
    internet_entire_listing_display_yn: row.internet_entire_listing_display_yn,
    owner_opt_out: row.owner_opt_out,
    participant_only: row.participant_only,
    status: row.status,
  });
  if (gateBlocks.length > 0) {
    return NextResponse.json(
      {
        error: "This listing is not eligible for distribution per REBNY RLS rules.",
        gate_blocks: gateBlocks,
      },
      { status: 422 },
    );
  }

  // ── Fair Housing scan on agent-composed free text ───────────────────────────
  const subject =
    typeof body.subject === "string" && body.subject.trim()
      ? body.subject.trim()
      : `Investment Opportunity — ${dtoAddressLine(dto)}`;
  const fhRecord: Record<string, string | null | undefined> = { subject };
  for (const f of ["headline", "intro", "locationBlurb", "purchaseStructure"] as const) {
    if (typeof body[f] === "string") fhRecord[f] = body[f] as string;
  }
  if (Array.isArray(body.benefitBullets)) {
    fhRecord.benefitBullets = (body.benefitBullets as unknown[]).map(String).join(" | ");
  }
  const fhViolations = scanRecordForFairHousing(fhRecord);
  if (fhViolations.length > 0) {
    return NextResponse.json(
      {
        error: "This campaign was blocked by the Fair Housing scanner. Please revise the text.",
        fair_housing_violations: fhViolations.map((v) => ({ field: v.field, severity: v.severity })),
      },
      { status: 422 },
    );
  }

  // ── Compute investment metrics + resolve the floor plan ─────────────────────
  // The DTO media is photo-first via the shared resolver, so the hero is a Photo
  // and the FloorPlan is pulled out separately for its own section (never the hero).
  // Square footage: prefer the listing's value; allow a compose-form override so
  // it always shows even when the listing record is missing it.
  const sqft = parseMoney(body.sqft) ?? dto.livingArea ?? null;
  const metrics = computeInvestmentMetrics({
    price: dto.listPrice || 0,
    monthlyRent: parseMoney(body.currentRent),
    monthlyMaintenance: parseMoney(body.maintenance),
    sqft,
  });
  const photoUrls = dto.media.filter((m) => m.mediaType === "Photo").map((m) => m.url);
  const floorPlanUrl = dto.media.find((m) => m.mediaType === "FloorPlan")?.url ?? null;

  // Sender identity is derived from the AUTHENTICATED agent — never from spoofable
  // body fields — so recipients always see the agent who actually sent it.
  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { first_name: true, last_name: true, email: true, phone: true, title: true, role: true },
  });
  const agentName = (agent ? `${agent.first_name || ""} ${agent.last_name || ""}`.trim() : "") || "Mallan Real Estate Inc.";
  const agentTitle = agent?.title || (agent?.role === "BROKER" ? "Licensed Real Estate Broker" : "Licensed Real Estate Salesperson");
  const agentEmail = agent?.email || null;
  const agentPhone = agent?.phone || null;

  const emailData: InvestorListingEmailData = {
    address: dtoAddressLine(dto),
    neighborhood: dto.address.neighborhood ?? null,
    price: dto.listPrice ? `$${dto.listPrice.toLocaleString()}` : "Price upon request",
    beds: dto.bedroomsTotal ?? null,
    baths: dto.bathroomsFull ?? null,
    sqft,
    propertyType: dto.propertyType ?? null,
    maintenance: strOrNull(body.maintenance),
    currentRent: strOrNull(body.currentRent),
    leaseExpiration: strOrNull(body.leaseExpiration),
    // The template inserts the CTA URL RAW into an href, so escape it at the
    // boundary — photo/floor-plan/other fields are escaped inside the template.
    detailUrl: escapeHtml(dto.url.startsWith("http") ? dto.url : `${BASE_URL}${dto.url}`),
    primaryPhotoUrl: photoUrls[0] ?? null,
    floorPlanUrl,
    metrics,
    headline: strOrUndef(body.headline),
    intro: strOrUndef(body.intro),
    // Building-specific — only rendered when the compose step supplies it, so it
    // never carries over to another listing automatically.
    purchaseStructure: strOrNull(body.purchaseStructure),
    benefitBullets: Array.isArray(body.benefitBullets)
      ? (body.benefitBullets as unknown[]).map(String)
      : undefined,
    locationBlurb: strOrUndef(body.locationBlurb),
    logoUrl: `${BASE_URL}/images/mallan-logo.png`,
    equalHousingLogoUrl: `${BASE_URL}/images/equal-housing-logo.svg`,
    // Headshot only when we actually have one for this agent (no per-agent photo
    // system yet), so a different sender never shows the wrong person's face.
    agentPhotoUrl: agentEmail === "maya@mallan.nyc" ? `${BASE_URL}/images/maya-allan.jpg` : null,
    agentName,
    agentTitle,
    agentPhone,
    agentEmail,
    officeAddress: "400 East 90th Street, Suite 17C, New York, NY 10128",
  };
  const html = investorListingEmail(emailData);

  // ── Recipients: normalize + dedup + suppression filter (defense-in-depth) ────
  const { clean, received, duplicate, invalid } = normalizeRecipients(body.recipients);
  const { kept, suppressed } = await filterSuppressedRecipients(clean, leadFinder());
  const counts = {
    received,
    valid: clean.length,
    duplicate,
    invalid,
    suppressed: suppressed.length,
    deliverable: kept.length,
  };

  // Preview: render + gate + FH only. No recipients required, no delivery, no audit.
  if (mode === "preview") {
    return NextResponse.json({
      mode,
      listing_id,
      subject,
      html,
      listing: { address: emailData.address, price: emailData.price, url: emailData.detailUrl, photoCount: photoUrls.length },
      counts,
    });
  }

  // From here we need recipients.
  if (kept.length === 0) {
    return NextResponse.json({ error: "No deliverable recipients after validation + suppression.", counts }, { status: 400 });
  }
  if (kept.length > MAX_CAMPAIGN_RECIPIENTS) {
    return NextResponse.json(
      { error: `Deliverable count ${kept.length} exceeds the cap of ${MAX_CAMPAIGN_RECIPIENTS}. Split the campaign.`, counts },
      { status: 400 },
    );
  }

  // Mode-specific pre-flight guards.
  let testAllowlist: readonly string[] | undefined;
  const dryRun = mode === "dry_run";
  if (mode === "test") {
    const list = Array.isArray(body.testAllowlist)
      ? (body.testAllowlist as unknown[]).map((a) => String(a).trim().toLowerCase()).filter(Boolean)
      : [];
    if (list.length === 0) {
      return NextResponse.json({ error: "test mode requires a non-empty testAllowlist." }, { status: 400 });
    }
    testAllowlist = list;
  }
  if (mode === "live") {
    // Fail-closed staging: live delivery is OFF unless explicitly enabled.
    if (process.env.CAMPAIGN_LIVE_SEND_ENABLED !== "true") {
      return NextResponse.json(
        { error: "Live campaign sending is disabled (CAMPAIGN_LIVE_SEND_ENABLED not set). Use dry_run/test.", counts },
        { status: 403 },
      );
    }
    // The reviewed count must match what we computed, or the list changed under
    // the operator — refuse rather than blast a different audience than approved.
    const confirmed = Number(body.confirmedCount);
    if (!Number.isFinite(confirmed) || confirmed !== counts.deliverable) {
      return NextResponse.json(
        { error: "confirmedCount does not match the deliverable count — re-review before sending.", counts },
        { status: 409 },
      );
    }
  }

  // ── Orchestrate the send (per-recipient audit, campaign_id, throttle) ────────
  //
  // COMPLIANCE POSTURE — CAN-SPAM cold commercial outreach (Maya-approved 2026-07-14).
  // This investor campaign targets 1031/investor prospects sourced from PUBLIC
  // RECORDS (ACRIS) / the buyer scanner — there is no prior relationship, so prior
  // opt-in consent is NOT required for commercial EMAIL under CAN-SPAM (15 USC 7704;
  // consent_captured_at is a TCPA rule for calls/SMS, and the warm-lead consent gate
  // in /api/crm/email governs opted-in CRM leads — a DIFFERENT path). This path
  // instead enforces the CAN-SPAM requirements: fail-closed opt-out suppression per
  // recipient (via sendEmail), a signed one-click List-Unsubscribe, and the physical
  // postal address in the footer. Recipients that have unsubscribed are never sent.
  const campaign_id = strOrUndef(body.campaign_id) || randomUUID();
  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;
  const sessionUser = { userId: auth.userId, userType: auth.userType } as SessionUser;

  // Campaign-level audit row (the grouping anchor).
  await prisma.auditEvent.create({
    data: {
      action: "email:campaign_started",
      entity_type: "listing",
      entity_id: listing_id,
      user_type: auth.userType,
      user_id: auth.userId,
      changes: { campaign_id, mode, subject, counts } as Prisma.InputJsonValue,
      ip_address: ipAddress ?? null,
    },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const results: { email: string; status: "sent" | "failed" | "skipped"; reason?: string }[] = [];

  for (const r of kept) {
    const result = await sendEmail(r.email, subject, html, sessionUser, {
      channel: "listings",
      replyTo: agentEmail || undefined,
      dryRun,
      testAllowlist,
    });

    let status: "sent" | "failed" | "skipped";
    let reason: string | undefined;
    if (result._dryRun) { status = "skipped"; reason = "dry_run"; skipped++; }
    else if (result._skippedTestMode) { status = "skipped"; reason = "not_in_test_allowlist"; skipped++; }
    else if (result._suppressed) { status = "skipped"; reason = "unsubscribed"; skipped++; }
    else if (result.success) { status = "sent"; sent++; }
    else { status = "failed"; reason = result._suppressionError ? "suppression_lookup_error" : (result.error || "send_failed"); failed++; }

    results.push({ email: r.email, status, reason });
    await prisma.auditEvent.create({
      data: {
        action: `email:${status}`,
        entity_type: "email",
        entity_id: r.email,
        user_type: auth.userType,
        user_id: auth.userId,
        changes: { campaign_id, listing_id, mode, reason: reason ?? null } as Prisma.InputJsonValue,
        ip_address: ipAddress ?? null,
      },
    });

    if (THROTTLE_MS > 0 && !dryRun) await sleep(THROTTLE_MS);
  }

  // Campaign-completion audit row.
  await prisma.auditEvent.create({
    data: {
      action: "email:campaign_completed",
      entity_type: "listing",
      entity_id: listing_id,
      user_type: auth.userType,
      user_id: auth.userId,
      changes: { campaign_id, mode, sent, failed, skipped, deliverable: counts.deliverable } as Prisma.InputJsonValue,
      ip_address: ipAddress ?? null,
    },
  });

  return NextResponse.json({
    campaign_id,
    mode,
    listing_id,
    subject,
    counts,
    result: { sent, failed, skipped },
    recipients: results,
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function dtoAddressLine(dto: ReturnType<typeof dbListingToPublicDTO>): string {
  const a = dto.address;
  const street = [a.streetNumber, a.streetName].filter(Boolean).join(" ").trim();
  const withUnit = a.unitNumber ? `${street}, ${a.unitNumber}` : street;
  return withUnit || dto.mlsId || "Property";
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
