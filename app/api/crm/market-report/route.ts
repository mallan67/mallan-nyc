// /api/crm/market-report — AI Market Report Builder
// POST: Generate a new market report
// GET: List previously generated reports (future: store in DB)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { generateMarketReport } from "@/lib/market-report/generator";

export const maxDuration = 60; // AI generation can take time

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const {
      report_type = "both",
      property_types = ["Condo", "Co-op", "Condop", "Townhouse"],
      borough,
      neighborhoods,
      period,
    } = body;

    if (!["sale", "rent", "both"].includes(report_type)) {
      return NextResponse.json(
        { error: "report_type must be sale, rent, or both" },
        { status: 400 }
      );
    }

    const report = await generateMarketReport({
      report_type,
      property_types,
      borough: borough || undefined,
      neighborhoods: neighborhoods || undefined,
      period: period || undefined,
    });

    // Reports/CMA Tier A P0 — AuditEvent for AI narrative generation.
    // NY DOS 19 NYCRR §175.25 advertising-substantiation: every
    // brokerage-attributable narrative must be auditable. The event
    // records prompt_hash + response_hash + char counts + model so the
    // exact text emitted on a given date is verifiable, without storing
    // raw prompts/responses (which can carry market data we don't need
    // to retain at the audit layer).
    //
    // Best-effort write — failure must not break report generation.
    await prisma.auditEvent
      .create({
        data: {
          action: "ai_narrative_generated",
          entity_type: "market_report",
          // Use the report's generated_at timestamp as a stable key for
          // the row (no DB persistence of the report itself yet).
          entity_id: report.generated_at,
          user_type: auth.userType,
          user_id: auth.userId,
          changes: {
            report_type,
            property_types,
            borough: borough || null,
            neighborhoods: neighborhoods || null,
            period: report.period,
            total_listings: report.total_listings,
            ai_meta: {
              ...report.ai_meta,
            },
          },
        },
      })
      .catch((err) => {
        // Non-fatal — audit failure should not block the response. Log
        // a category and continue.
        const cat = err instanceof Error ? "audit_write" : "unknown";
        console.error(`[market-report] audit write failed | category=${cat}`);
      });

    return NextResponse.json({ report });
  } catch (e: unknown) {
    // Redact raw error per Codex Risk P0 pattern.
    const cat = e instanceof Error
      ? (e.message.toLowerCase().includes("rate") ? "rate_limited"
        : e.message.toLowerCase().includes("auth") ? "auth_failed"
        : e.message.toLowerCase().includes("timeout") ? "timeout"
        : "other")
      : "unknown";
    console.error(`[market-report] generation error | category=${cat}`);
    return NextResponse.json(
      { error: "Market report generation failed. Please try again." },
      { status: 500 },
    );
  }
}
