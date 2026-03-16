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
  let totalChecks = 0;
  let totalPasses = 0;

  for (const listing of listings) {
    const raw = (listing.raw_data as Record<string, unknown>) ?? {};
    const listingId = listing.listing_id ?? listing.id.toString();
    const address = (listing.address ?? raw.UnparsedAddress ?? "Unknown") as string;
    const agentId = listing.agent_id?.toString() ?? null;

    // Run REBNY validator
    const validation = validateListing(raw);
    totalChecks += (validation.errors?.length ?? 0) + (validation.warnings?.length ?? 0) + 1;

    if (validation.valid) {
      totalPasses++;
    }

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
      const fairHousingPatterns = [
        /\b(white|black|asian|hispanic|latino|arab|jewish|muslim|christian)\b/i,
        /\b(no children|adults only|no kids|no families)\b/i,
        /\b(no wheelchair|no disabled|handicap free)\b/i,
        /\b(bachelor pad|man cave|perfect for singles)\b/i,
        /\b(walking distance to church|near synagogue|mosque nearby)\b/i,
        /\b(exclusive neighborhood|prestigious community)\b/i,
      ];
      for (const pattern of fairHousingPatterns) {
        if (pattern.test(description)) {
          findings.push({
            listingId, address, agentId,
            category: "fair_housing",
            severity: "critical",
            title: "Potential Fair Housing language violation",
            description: `Description may contain discriminatory language matching: ${pattern.source}`,
            fix: "Review and revise the listing description to remove potentially discriminatory language",
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
