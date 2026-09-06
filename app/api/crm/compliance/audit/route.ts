// POST /api/crm/compliance/audit
// Bulk compliance audit — validates all active RLS-eligible listings server-side.
// Returns per-listing findings with severity, category, fix steps.
// Broker-only.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { validateListing } from "@/lib/compliance/rebny-validator";

interface AuditFinding {
  listingId: string;
  address: string;
  agentId: string | null;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  fix: string;
}

/**
 * POST /api/crm/compliance/audit
 * Runs a full compliance audit across all active listings.
 */
export async function POST(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  // Fetch all active RLS-eligible listings
  const listings = await prisma.listing.findMany({
    where: {
      status: { in: ["Active", "Pending", "ActiveUnderContract", "ComingSoon", "Hold"] },
      rls_eligible: { not: false },
    },
    select: {
      id: true,
      listing_id: true,
      listing_type: true,
      address: true,
      status: true,
      agent_id: true,
      rls_eligible: true,
      idx_display_yn: true,
      raw_data: true,
      created_at: true,
      updated_at: true,
      days_on_market: true,
    },
  });

  const findings: AuditFinding[] = [];

  for (const listing of listings) {
    const raw = (listing.raw_data as Record<string, unknown>) ?? {};
    const listingId = listing.listing_id ?? listing.id.toString();
    const address = (listing.address ?? raw.UnparsedAddress ?? "Unknown") as string;
    const agentId = listing.agent_id?.toString() ?? null;

    // Reporting wrapper + the ONE required / conditional evaluator (rls-enforcement over REBNY_UCBA_RULES).
    const validation = validateListing(raw, {
      listingType: (listing.listing_type as string) === "rent" ? "rent" : "sale",
      isNewDevelopment: raw.NewDevelopmentYN === true,
      currentStatus: (raw._mallanStatus as string) || listing.status || undefined,
      rlsEligible: listing.rls_eligible !== false,
    });

    // Convert validation errors to findings
    if (validation.errors) {
      for (const err of validation.errors) {
        const errObj: { field?: string; message?: string } = typeof err === 'string' ? { message: err } : err as { field?: string; message?: string };
        findings.push({
          listingId,
          address,
          agentId,
          category: categorizeError(errObj),
          severity: "critical",
          title: errObj.field ? `Missing required field: ${errObj.field}` : (errObj.message ?? "Validation error"),
          description: errObj.message ?? errObj.field ?? "Unknown error",
          fix: errObj.field ? `Add ${errObj.field} to the listing` : "Review and fix the listing data",
        });
      }
    }

    if (validation.warnings) {
      for (const warn of validation.warnings) {
        const warnObj: { field?: string; message?: string } = typeof warn === 'string' ? { message: warn } : warn as { field?: string; message?: string };
        findings.push({
          listingId,
          address,
          agentId,
          category: categorizeError(warnObj),
          severity: "medium",
          title: warnObj.message ?? "Warning",
          description: warnObj.message ?? warnObj.field ?? "",
          fix: warnObj.field ? `Review ${warnObj.field}` : "Review the listing",
        });
      }
    }

    // Distribution gate checks
    const ownerOptOut = raw.OwnerOptOut || raw.owner_opt_out;
    if (ownerOptOut) {
      findings.push({
        listingId, address, agentId,
        category: "distribution",
        severity: "critical",
        title: "Owner Opt-Out active",
        description: "This listing has Owner Opt-Out enabled. It should not be displayed publicly.",
        fix: "Remove owner opt-out or delist from public display",
      });
    }

    const idxDisplay = listing.idx_display_yn;
    if (idxDisplay === false && listing.status !== "Closed") {
      findings.push({
        listingId, address, agentId,
        category: "distribution",
        severity: "high",
        title: "IDX display disabled",
        description: "IDXEntireListingDisplayYN is false. This listing won't appear in IDX feeds.",
        fix: "Enable IDX display if this listing should be publicly searchable",
      });
    }

    // Photo checks
    const photos = (raw.Media ?? raw.photos ?? []) as unknown[];
    if (!photos || (Array.isArray(photos) && photos.length === 0)) {
      findings.push({
        listingId, address, agentId,
        category: "media",
        severity: "high",
        title: "No photos uploaded",
        description: "Listings without photos get significantly less engagement.",
        fix: "Upload at least 3 photos to the listing",
      });
    } else if (Array.isArray(photos) && photos.length < 3) {
      findings.push({
        listingId, address, agentId,
        category: "media",
        severity: "medium",
        title: "Insufficient photos",
        description: `Only ${photos.length} photo(s). Recommend at least 3.`,
        fix: "Upload additional photos",
      });
    }

    // Stale listing check
    const dom = listing.days_on_market ?? 0;
    if (dom > 90 && listing.status === "Active") {
      findings.push({
        listingId, address, agentId,
        category: "stale",
        severity: "medium",
        title: `Stale listing — ${dom} days on market`,
        description: "This listing has been active for over 90 days without a status change.",
        fix: "Consider a price adjustment or status update",
      });
    }

    // Fair Housing scan on description
    const description = (raw.PublicRemarks ?? raw.public_remarks ?? "") as string;
    if (description) {
      // Fair Housing patterns — aligned with public/crm/js/compliance/fair-housing.js (29 patterns, 10 categories)
      const fairHousingPatterns: { pattern: RegExp; category: string }[] = [
        // Race / National Origin
        { pattern: /\b(white|caucasian|black|african[- ]?american|hispanic|latino|latina|asian|oriental|chinese|japanese|korean|indian|arab|jewish|irish|italian|russian)\s*(neighborhood|community|area|tenants?|residents?|buyers?|renters?|preferred|only|welcome)\b/i, category: "Race / National Origin" },
        { pattern: /\b(no\s+(?:blacks|whites|hispanics|asians|foreigners|immigrants|minorities))\b/i, category: "Race / National Origin" },
        { pattern: /\b(exclusive\s+(?:neighborhood|community|enclave))\b/i, category: "Race / National Origin" },
        { pattern: /\b(ethnic)\b/i, category: "Race / National Origin" },
        // Religion
        { pattern: /\b(christian|catholic|protestant|muslim|islamic|mosque|synagogue|temple|church)\s*(neighborhood|community|area|district|preferred|only)\b/i, category: "Religion" },
        { pattern: /\b(near\s+(?:church|mosque|synagogue|temple))\b/i, category: "Religion" },
        // Familial Status / Age
        { pattern: /\b(no\s+(?:children|kids|babies|families|pets))\b/i, category: "Familial Status" },
        { pattern: /\b(adults?\s+only|senior(?:s)?\s+only|no\s+children|child[- ]?free|55\s*\+|over\s+55|empty\s+nesters?\s+only|mature\s+(?:couple|person|individual|tenant)s?\s+(?:only|preferred))\b/i, category: "Familial Status / Age" },
        { pattern: /\b(perfect\s+for\s+(?:singles?|couples?|young\s+professionals?|retirees?|students?|bachelor))\b/i, category: "Familial Status" },
        { pattern: /\b(great\s+for\s+(?:families|singles?|couples?|young\s+professionals?|retirees?))\b/i, category: "Familial Status" },
        { pattern: /\b(bachelor\s+pad|man\s+cave|she[- ]?shed)\b/i, category: "Sex / Familial Status" },
        // Sex
        { pattern: /\b(female\s+only|male\s+only|men\s+only|women\s+only|no\s+(?:men|women|males|females))\b/i, category: "Sex" },
        // Disability
        { pattern: /\b(no\s+(?:wheelchairs?|disabled|handicapped)|(?:handicapped|crippled|invalid|insane|retarded|crazy))\b/i, category: "Disability" },
        { pattern: /\b(walking\s+distance)\b/i, category: "Disability" },
        // Source of Income (NYC Law)
        { pattern: /\b(no\s+(?:section\s*8|vouchers?|subsidies|public\s+assistance|welfare|DSS|FHEPS|CityFHEPS))\b/i, category: "Source of Income (NYC Law)" },
        { pattern: /\b(section\s*8\s*(?:not\s+)?accepted)\b/i, category: "Source of Income (NYC Law)" },
        // Arrest/Conviction Record (NYC Fair Chance Housing Act — LL 24/2023, effective Jan 2025)
        { pattern: /\b(arrest|conviction|criminal|felon|background\s*check\s*required|criminal\s*record|ex[\s-]?con)\b/i, category: "Arrest/Conviction Record (NYC Title 8)" },
        // National Origin / Citizenship
        { pattern: /\b(citizens?\s+only|(?:no|must\s+be)\s+(?:citizen|legal\s+resident|documented|us\s+citizen|american\s+citizen))\b/i, category: "National Origin / Citizenship" },
        // NY DOS Advertising Rules
        { pattern: /\b(prestigious|upscale|luxurious)\s*(neighborhood|community|area)\b/i, category: "NY DOS Ad Rules" },
        { pattern: /\b(integrated|segregated|transitional|changing)\s*(neighborhood|community|area)\b/i, category: "NY DOS Ad Rules" },
        { pattern: /\b(safe\s+(?:neighborhood|area|community|street))\b/i, category: "NY DOS Ad Rules" },
      ];
      for (const rule of fairHousingPatterns) {
        if (rule.pattern.test(description)) {
          findings.push({
            listingId, address, agentId,
            category: "fair_housing",
            severity: "critical",
            title: `Fair Housing violation: ${rule.category}`,
            description: `Description contains language matching ${rule.category}: ${rule.pattern.source}`,
            fix: "Review and revise the listing description to remove discriminatory language",
          });
          break; // One finding per listing for fair housing
        }
      }
    }
  }

  // Compute score
  const score = listings.length > 0
    ? Math.round(((listings.length - findings.filter(f => f.severity === "critical").length) / listings.length) * 100)
    : 100;

  // Log the audit
  await logAuditEvent(
    "compliance_audit",
    "system",
    "bulk",
    auth,
    { listingsAudited: listings.length, findingsCount: findings.length, score },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    score,
    listingsAudited: listings.length,
    totalFindings: findings.length,
    critical: findings.filter(f => f.severity === "critical").length,
    high: findings.filter(f => f.severity === "high").length,
    medium: findings.filter(f => f.severity === "medium").length,
    low: findings.filter(f => f.severity === "low").length,
    findings,
    auditedAt: new Date().toISOString(),
  });
}

function categorizeError(err: { field?: string; message?: string }): string {
  const field = (err.field ?? "").toLowerCase();
  const msg = (err.message ?? "").toLowerCase();
  if (field.includes("fair") || msg.includes("fair") || msg.includes("housing")) return "fair_housing";
  if (field.includes("idx") || field.includes("display") || msg.includes("distribution")) return "distribution";
  if (field.includes("photo") || field.includes("media")) return "media";
  if (field.includes("address") || field.includes("price") || field.includes("required")) return "data_quality";
  return "rebny_rls";
}
