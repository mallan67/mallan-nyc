// POST /api/crm/clients/[id]/report-send
//
// THE canonical path by which an Agent sends a client-facing Mallan report, and the only one that produces
// durable brokerage history for it.
//
// WHAT THIS REPLACES. reports.js used to hand the message straight to EmailJS from the BROWSER
// (email-service.js:47 -> emailjs.send). The message never touched Mallan infrastructure, so:
//   - it bypassed lib/email/sendgrid.ts and therefore the canonical suppression check, letting an agent
//     email a client who had unsubscribed (its only unsubscribe handling was footer prose asking the
//     client to reply "Unsubscribe");
//   - its only record was logAuditEntry writing localStorage — per-browser, per-agent, lost on a cache
//     clear. A git grep for report_send_to_client across app/ and lib/ returned nothing, so the brokerage
//     could not answer "what did this agent send this client, and when?".
//
// WHAT "SUCCESS" MEANS, deliberately narrow. lib/email/sendgrid.ts is nodemailer against
// smtp.office365.com. A resolved send means the SMTP service ACCEPTED the message. There is no
// delivery/bounce webhook in this repository, so nothing here claims the client received it: the record
// says delivery_status 'accepted'. Claiming delivery would be inventing a certainty the infrastructure
// cannot provide.
//
// QUALIFICATION IS COMPUTED HERE, NEVER ACCEPTED FROM THE BROWSER. The caller may REQUEST
// purpose: 'nurture'. It may not assert qualifies_nurture — that is a business outcome, and a client that
// can set it can reset a six-month relationship clock by claiming it did something it did not do.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { isLeadExplicitlyInactive, LEAD_PORTAL_ACCESS_REVOKED } from "@/lib/auth/lead-access";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { sendEmail } from "@/lib/email/sendgrid";
import { escapeHtml } from "@/lib/sanitize";
import { isInCanonicalNurture } from "@/lib/crm/nurture-due";
import {
  evaluateClientDistributionEligibility,
  CLIENT_DISTRIBUTION_REFUSAL,
} from "@/lib/compliance/client-distribution";

type RouteParams = { params: Promise<{ id: string }> };

/** The one purpose that can discharge the nurture obligation. Everything else is ordinary correspondence. */
const NURTURE_PURPOSE = "nurture";

// ── THE REPORT VOCABULARY, CENSUSED FROM THE UI THAT EMITS IT.
//
//    report_type is reportState.format in public/crm/js/output/reports.js, and the complete value
//    set is the nine format tiles in public/crm/html/modals/reports.html. Nothing here is invented:
//    these are the values the product can actually produce. An unrecognised value is normalised to
//    null rather than stored, because a caller string that reaches durable history unchecked is
//    how a scheduling authority ends up trusting arbitrary input.
const KNOWN_REPORT_TYPES = new Set([
  "grid",
  "list",
  "summary",
  "detail",
  "factSheet",
  "cma",
  "openHouse",
  "images",
  "comparison",
]);

// ── WHICH OF THOSE ARE SUBSTANTIVE ENOUGH TO DISCHARGE A SIX-MONTH OBLIGATION.
//
//    Packet 2 makes qualifies_nurture a SCHEDULING AUTHORITY: it resets the client's relationship
//    clock. Intent alone cannot carry that. Before this check, an authenticated agent could post
//    arbitrary HTML with purpose 'nurture' and reset a six-month clock, because the server computed
//    qualification from the requested purpose and never looked at what was actually sent.
//
//    Excluded, with reasons rather than taste:
//      grid, list   - listing-share layouts. Forwarding search results to a client is a useful
//                     thing to do and is not a relationship report.
//      images       - a photo gallery.
//      openHouse    - event logistics. Event-driven work is a separate workflow from the nurture
//                     relationship cadence, by owner ruling.
//
//    'summary' is the judgment call in this set and is included as a market summary document. If
//    that reads as too permissive, removing it is a one-line change and the negative proofs in
//    tests/runtime/crm-nurture-qualification.test.ts will still hold.
const SUBSTANTIVE_NURTURE_REPORT_TYPES = new Set([
  "summary",
  "detail",
  "factSheet",
  "cma",
  "comparison",
]);

/** reportState.version, the other half of the same census. */
const KNOWN_REPORT_VERSIONS = new Set(["agent", "customer"]);

// The audience a client delivery is served under. reports.js forces 'public' for the duration of
// any client delivery whatever version the report was built as, so a caller declaring 'member' is
// either broken or attempting to route member-only content to a client. Fail closed.
const CLIENT_DELIVERY_AUDIENCE = "public";

export async function POST(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id: safeBigInt(id) ?? BigInt(-1) } });
  if (!lead) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Safety Packet 1 is not weakened by this route: a disabled client receives nothing, report or otherwise.
  if (isLeadExplicitlyInactive(lead.status)) {
    return NextResponse.json({ error: LEAD_PORTAL_ACCESS_REVOKED }, { status: 409 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "A report body is required" }, { status: 400 });
  }

  // The subject is caller-supplied text that lands in a mail header and in client-visible chrome, so it is
  // escaped. The BODY is deliberately not: it is the generated report, and escaping it would destroy the
  // document this route exists to deliver.
  //
  // THAT ASYMMETRY IS WORTH STATING PLAINLY RATHER THAN LEAVING TO A GREP. This route accepts rendered
  // HTML from the browser and mails it under Mallan branding, so the report body is only as trustworthy as
  // an authenticated agent session. That was equally true of the EmailJS path this replaces — moving the
  // send server-side did not create the exposure, it made it visible — but it is not CLOSED by this packet.
  // Closing it means rendering the report on the server, which is a far larger change than Packet 1 and is
  // registered rather than smuggled in. The compliance rule that requires escapeHtml in an email endpoint
  // is satisfied here by a real escape, not by importing the symbol to quiet the check.
  const subject = escapeHtml(typeof body.subject === "string" ? body.subject : "");
  const html = typeof body.html === "string" ? body.html : "";
  if (!subject || !html) {
    return NextResponse.json({ error: "subject and html are required" }, { status: 400 });
  }

  // ── IDEMPOTENCY, AND AN HONEST STATEMENT OF ITS LIMIT.
  //
  //    This mirrors app/api/crm/listing-sends/route.ts:56-80 rather than inventing a second mechanism, and
  //    it defends the case that actually happens: the agent's browser times out waiting for SMTP and
  //    retries, or the agent clicks twice. The claim below is written BEFORE the send rather than after it,
  //    which is the difference that matters — it removes the whole SMTP round-trip (seconds) from the
  //    window during which a duplicate could slip through, leaving only a database round-trip.
  //
  //    IT IS NOT EXACTLY-ONCE, and must not be described as such. Two genuinely concurrent requests can
  //    both complete the lookup before either writes, because AuditEvent carries no unique constraint on
  //    the key — there is no unique index, no lock table and no idempotency model anywhere in this schema
  //    to claim atomically against, and the listing-sends precedent has the same exposure without saying
  //    so. True exactly-once needs a uniquely-constrained claim, which is schema growth and therefore a
  //    held mutation; it is registered rather than taken here.
  //
  //    A failed send does not block the agent: the browser mints a new key per click, so a retry after a
  //    failure is a new claim rather than a replay of the old one.
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existing = await prisma.auditEvent.findFirst({
      where: {
        action: "client_report_sent",
        entity_type: "lead",
        entity_id: lead.id.toString(),
        created_at: { gte: fiveMinAgo },
        changes: { path: ["idempotency_key"], equals: idempotencyKey },
      },
    });
    if (existing) {
      return NextResponse.json({ success: true, deduplicated: true, sent_at: existing.created_at.toISOString() });
    }
  }

  // ── Server-side listing eligibility. The browser already applied the C4C audience gate when it built
  //    the report, but a browser claim that a population was governed is not evidence that it was. This
  //    re-decides from stored facts through the same canonical helper /listing-sends and /actions use.
  const listingIds = Array.isArray(body.listing_ids) ? body.listing_ids.map(String) : [];
  if (listingIds.length > 0) {
    const listings = await prisma.listing.findMany({
      where: { listing_id: { in: listingIds } },
      select: {
        listing_id: true,
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        owner_opt_out: true,
        participant_only: true,
      },
    });

    // REQUESTED MUST EQUAL RESOLVED. Checking only the rows that came back would let an id the database
    // could not resolve fall silently out of the eligibility check — the report would still be sent, and a
    // listing nobody verified would ride along in it. An unverifiable listing is refused, not skipped: at a
    // compliance boundary, "not found" is not "fine".
    const resolved = new Set(listings.map((l) => l.listing_id));
    const missing = listingIds.filter((id) => !resolved.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "Some listings in this report could not be verified and the send was refused.", missing },
        { status: 400 },
      );
    }

    const ineligible = listings
      .map((l) => ({ id: l.listing_id, verdict: evaluateClientDistributionEligibility(l) }))
      .filter((r) => !r.verdict.allowed);
    if (ineligible.length > 0) {
      return NextResponse.json(
        {
          error: CLIENT_DISTRIBUTION_REFUSAL,
          listings: ineligible.map((r) => ({ listing_id: r.id, reasons: r.verdict.reasons })),
        },
        { status: 400 },
      );
    }
  }

  const requestedPurpose = typeof body.purpose === "string" ? body.purpose : "other";

  // Caller-supplied descriptors are NORMALISED, not trusted. An unrecognised report type or
  // version becomes null: it is not a value this product can emit, so storing it would put a
  // string nobody validated into the history a scheduler now reads.
  const rawReportType = typeof body.report_type === "string" ? body.report_type : null;
  const reportType = rawReportType && KNOWN_REPORT_TYPES.has(rawReportType) ? rawReportType : null;
  const rawReportVersion = typeof body.report_version === "string" ? body.report_version : null;
  const reportVersion =
    rawReportVersion && KNOWN_REPORT_VERSIONS.has(rawReportVersion) ? rawReportVersion : null;
  const audience = typeof body.audience === "string" ? body.audience : null;

  // A client delivery is served under the public audience. Refusing a 'member' claim here is a
  // compliance boundary, not tidiness: the member audience carries data this recipient may not see.
  if (audience !== null && audience !== CLIENT_DELIVERY_AUDIENCE) {
    return NextResponse.json(
      {
        error:
          "A client report is delivered under the public audience. This send declared a different audience and was refused.",
        audience,
      },
      { status: 400 },
    );
  }

  // ── The governed send. sendEmail owns suppression and is FAIL-CLOSED in both directions: an
  //    unsubscribed recipient is refused (_suppressed), and a suppression lookup that cannot complete is
  //    also refused (_suppressionError) — availability is not consent.
  // The claim, written before the send. See the idempotency note above for exactly what this does and
  //    does not guarantee.
  if (idempotencyKey) {
    await prisma.auditEvent.create({
      data: {
        action: "client_report_sent",
        entity_type: "lead",
        entity_id: lead.id.toString(),
        user_type: "agent",
        user_id: auth.userId,
        changes: { idempotency_key: idempotencyKey, claimed_at: new Date().toISOString() },
      },
    }).catch(() => {});
  }

  const result = await sendEmail(lead.email, subject, html, auth, { transactional: false });

  const baseMetadata = {
    purpose: requestedPurpose,
    report_type: reportType,
    report_version: reportVersion,
    audience,
    delivery_channel: "email",
    listing_ids: listingIds,
  };

  if (!result.success) {
    // A refused or failed attempt is recorded as history, but never as a qualifying one. The nurture clock
    // is advanced by delivery accepted, not by intent.
    await prisma.activityLog.create({
      data: {
        lead_id: lead.id,
        activity_type: "client_report_send_failed",
        title: `Report send failed: ${subject}`,
        detail: result.error ?? null,
        actor_type: "agent",
        actor_id: auth.userId,
        metadata: {
          ...baseMetadata,
          qualifies_nurture: false,
          delivery_status: result._suppressed ? "suppressed" : "failed",
        },
      },
    }).catch(() => {});
    return NextResponse.json(
      { error: result.error ?? "Send failed", suppressed: result._suppressed === true },
      { status: result._suppressed ? 409 : 502 },
    );
  }

  // ── SERVER-COMPUTED QUALIFICATION. Every condition below had to hold to reach this line: an
  //    authenticated responsible agent or broker, an authorised canonical client who is not disabled, a
  //    governed listing population, a communication that was not suppressed, and an accepted send. The
  //    only thing the caller contributed is the REQUEST that this was a nurture touch.
  //
  //    INTENT IS NECESSARY AND NOT SUFFICIENT. Packet 2 turned this flag into a scheduling
  //    authority — it resets the client's six-month relationship clock — so it now also requires
  //    that the thing sent was a recognised SUBSTANTIVE report. Before that, an authenticated agent
  //    could post arbitrary HTML with purpose 'nurture' and discharge the obligation, because
  //    nothing on the server looked at report_type at all. A listing-share grid, a photo gallery or
  //    an open-house notice is a legitimate thing to email a client and is not a relationship
  //    report; sending one should not tell the platform the relationship was serviced.
  //    AND THE CLIENT MUST CURRENTLY BE IN NURTURE. Intent plus substance still is not enough. A
  //    report to a client in 'new', 'contacted' or an active transacting stage is an ordinary and
  //    useful thing to send; it must not silently enrol them in a six-month relationship cadence,
  //    because the canonical Nurture state is pipeline_stage 'nurturing' and nothing else. Without
  //    this check an agent could give any client a nurture clock by ticking one box on one send.
  //
  //    Note what this does NOT do: it does not refuse the send, and it deletes no history. A client
  //    who later enters Nurture starts their clock from that entry.
  const qualifiesNurture =
    requestedPurpose === NURTURE_PURPOSE &&
    reportType !== null &&
    SUBSTANTIVE_NURTURE_REPORT_TYPES.has(reportType) &&
    isInCanonicalNurture(lead.pipeline_stage);

  const activity = await prisma.activityLog.create({
    data: {
      lead_id: lead.id,
      activity_type: "client_report_sent",
      title: subject,
      detail: reportType ? `Report: ${reportType}` : null,
      // THE RESPONSIBLE AGENT IS A STRUCTURED FACT. This was null with the real id buried in
      // metadata.sent_by_agent_id — a canonical owner hidden in JSON while its own column sat empty, which
      // is exactly the shape this repository keeps removing. Every other ActivityLog writer in the codebase
      // passes auth.userId here (crm/events:145, sales/promote:74, tasks:120).
      actor_type: "agent",
      actor_id: auth.userId,
      metadata: {
        ...baseMetadata,
        qualifies_nurture: qualifiesNurture,
        // When an agent ASKED for nurture credit and did not get it, say why. Otherwise the only
        // evidence is a false flag and the agent has no way to learn that the report class mattered.
        ...(requestedPurpose === NURTURE_PURPOSE && !qualifiesNurture
          ? {
              nurture_declined_reason: !isInCanonicalNurture(lead.pipeline_stage)
                ? "client_not_in_canonical_nurture"
                : reportType === null
                  ? "unrecognized_report_type"
                  : "report_type_not_substantive",
              requested_report_type: rawReportType,
            }
          : {}),
        // ACCEPTED, not delivered. See the header: there is no bounce callback to justify the stronger word.
        delivery_status: "accepted",
        message_id: result.messageId ?? null,
      },
    },
  });

  await logAuditEvent(
    "client_report_sent",
    "lead",
    lead.id.toString(),
    auth,
    {
      report_type: reportType,
      purpose: requestedPurpose,
      qualifies_nurture: qualifiesNurture,
      delivery_status: "accepted",
    },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json({
    success: true,
    activity_id: activity.id.toString(),
    qualifies_nurture: qualifiesNurture,
    report_type: reportType,
    delivery_status: "accepted",
  });
}
