// GET /api/crm/outlook/scan
// Scans a mail folder and returns extracted contacts from each email
// Query: ?folder=FOLDER_ID&top=50&skip=0
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getOutlookToken } from "@/lib/outlook/get-token";
import { getMessages, stripHtml } from "@/lib/outlook/graph-client";

// ── Skip broker/listing emails from other agents ────────────
// These are RLS feeds, StreetEasy alerts, mass broker emails, etc.
const SKIP_DOMAINS = [
  "streeteasy.com", "zillow.com", "trulia.com", "realtor.com",
  "redfin.com", "compass.com", "homes.com", "renthop.com",
  "apartments.com", "zumper.com", "hotpads.com", "nakedapartments.com",
  "perchwell.com", "realtymx.com", "olr.com", "nestio.com",
  "corcoran.com", "elliman.com", "sothebysrealty.com", "bhsusa.com",
  "halstead.com", "warburgrealty.com", "brownharrisstevens.com",
  "noreply", "no-reply", "notifications", "alerts", "mailer-daemon",
  "postmaster", "donotreply", "newsletter", "marketing",
  "rebny.com", "cotality.com", "corelogic.com", "trestle",
];

const SKIP_SUBJECT_PATTERNS = [
  /new\s+listing/i, /price\s+(?:change|drop|reduction)/i,
  /just\s+listed/i, /open\s+house\s+(?:alert|invite)/i,
  /market\s+report/i, /weekly\s+digest/i, /daily\s+alert/i,
  /listing\s+update/i, /inventory\s+report/i,
  /unsubscribe/i, /auto-?reply/i, /out\s+of\s+office/i,
];

function shouldSkipEmail(fromEmail: string, subject: string): boolean {
  const fromLower = fromEmail.toLowerCase();
  for (const domain of SKIP_DOMAINS) {
    if (fromLower.includes(domain)) return true;
  }
  for (const rx of SKIP_SUBJECT_PATTERNS) {
    if (rx.test(subject)) return true;
  }
  return false;
}

// ── Contact extraction from email text ──────────────────────

interface ExtractedContact {
  name: string;
  email: string;
  phone: string;
  role: string; // buyer | seller | renter | landlord | unknown
  source_subject: string;
  source_date: string;
  source_from: string;
}

function extractContacts(
  plainText: string,
  subject: string,
  date: string,
  fromName: string,
  fromEmail: string,
  toEmails: string[],
  ccEmails: string[]
): ExtractedContact[] {
  const contacts: ExtractedContact[] = [];
  const lines = plainText.split("\n").map((l) => l.trim()).filter(Boolean);

  // Extract all emails from body
  const emailRx = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const bodyEmails = (plainText.match(emailRx) || [])
    .filter((e, i, a) => a.indexOf(e) === i)
    .filter((e) => e !== fromEmail); // exclude sender

  // Extract all phones
  const phoneRx = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
  const phones = (plainText.match(phoneRx) || [])
    .filter((p) => p.replace(/\D/g, "").length >= 7)
    .filter((p, i, a) => a.indexOf(p) === i);

  // Detect role from subject + body
  const fullText = (subject + " " + plainText).toLowerCase();
  let defaultRole = "unknown";
  if (/\b(?:tenant|renter|lease|rent)\b/.test(fullText)) defaultRole = "renter";
  else if (/\b(?:buyer|purchase|buying|pre-approv)\b/.test(fullText)) defaultRole = "buyer";
  else if (/\b(?:seller|listing|exclusive|cma)\b/.test(fullText)) defaultRole = "seller";
  else if (/\b(?:landlord|owner|property\s*owner)\b/.test(fullText)) defaultRole = "landlord";

  // Detect named people from lines (First Last pattern)
  const nameRx = /^[A-Z][a-z'-]+\s+(?:[A-Z]\.?\s+)?[A-Z][a-z'-]+/;
  const skipRx = /^(?:hi |hello |dear |from |to |cc |subject |sent |date |on |regards|thank|best|sincerely|forwarded|original)/i;

  // Section-based detection
  let currentRole = defaultRole;
  const ownerRx = /^(?:owner|landlord|property\s*owner|seller|lessor)\s*[:.]?\s*(.*)/i;
  const tenantRx = /^(?:tenant|renter|buyer|lessee|purchaser|applicant)\s*[:.]?\s*(.*)/i;

  const detectedNames: Array<{ name: string; role: string }> = [];

  for (const line of lines) {
    const om = ownerRx.exec(line);
    if (om) {
      currentRole = /seller/i.test(line) ? "seller" : "landlord";
      const inline = (om[1] || "").trim();
      if (inline && nameRx.test(inline)) detectedNames.push({ name: inline, role: currentRole });
      continue;
    }
    const tm = tenantRx.exec(line);
    if (tm) {
      currentRole = /buyer|purchaser/i.test(line) ? "buyer" : "renter";
      const inline = (tm[1] || "").trim();
      if (inline && nameRx.test(inline)) detectedNames.push({ name: inline, role: currentRole });
      continue;
    }

    // Labeled name
    const nameLabel = line.match(/(?:name)\s*[:]\s*(.+)/i);
    if (nameLabel) {
      detectedNames.push({ name: nameLabel[1].trim(), role: currentRole });
      continue;
    }

    // Unlabeled name
    if (nameRx.test(line) && !skipRx.test(line) && !line.includes("@") && !/\b(?:LLC|Trust|Corp|Inc)\b/i.test(line)) {
      detectedNames.push({ name: line, role: currentRole });
    }
  }

  // Build contacts from detected names
  const usedEmails = new Set<string>();
  const usedPhones = new Set<string>();

  for (let i = 0; i < detectedNames.length; i++) {
    const email = bodyEmails.find((e) => !usedEmails.has(e)) || "";
    const phone = phones.find((p) => !usedPhones.has(p)) || "";
    if (email) usedEmails.add(email);
    if (phone) usedPhones.add(phone);

    contacts.push({
      name: detectedNames[i].name,
      email,
      phone,
      role: detectedNames[i].role,
      source_subject: subject,
      source_date: date,
      source_from: fromName || fromEmail,
    });
  }

  // If no names detected but we have emails from body or recipients, create entries
  if (contacts.length === 0) {
    const allEmails = [...bodyEmails, ...toEmails.filter((e) => e !== fromEmail)];
    const unique = allEmails.filter((e, i, a) => a.indexOf(e) === i);

    for (let i = 0; i < Math.min(unique.length, 4); i++) {
      contacts.push({
        name: "",
        email: unique[i],
        phone: phones[i] || "",
        role: defaultRole,
        source_subject: subject,
        source_date: date,
        source_from: fromName || fromEmail,
      });
    }
  }

  return contacts;
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const token = await getOutlookToken(BigInt(auth.userId));
  if (!token) {
    return NextResponse.json({ connected: false, error: "Outlook not connected" }, { status: 401 });
  }

  const folderId = req.nextUrl.searchParams.get("folder");
  if (!folderId) {
    return NextResponse.json({ error: "folder parameter required" }, { status: 400 });
  }

  const top = Math.min(parseInt(req.nextUrl.searchParams.get("top") || "50"), 100);
  const skip = parseInt(req.nextUrl.searchParams.get("skip") || "0");

  try {
    const { messages } = await getMessages(token, folderId, top, skip);

    const allContacts: ExtractedContact[] = [];

    let skippedCount = 0;
    for (const msg of messages) {
      const fromEmail = msg.from?.emailAddress?.address || "";
      const fromName = msg.from?.emailAddress?.name || "";

      // Skip broker/listing/automated emails
      if (shouldSkipEmail(fromEmail, msg.subject || "")) {
        skippedCount++;
        continue;
      }

      const plainText = msg.body.contentType === "html"
        ? stripHtml(msg.body.content)
        : msg.body.content;

      const toEmails = (msg.toRecipients || []).map((r) => r.emailAddress.address);
      const ccEmails = (msg.ccRecipients || []).map((r) => r.emailAddress.address);

      const extracted = extractContacts(
        plainText,
        msg.subject || "",
        msg.receivedDateTime || "",
        fromName,
        fromEmail,
        toEmails,
        ccEmails
      );

      allContacts.push(...extracted);
    }

    // Deduplicate by email
    const seen = new Set<string>();
    const dedupedContacts = allContacts.filter((c) => {
      if (!c.email) return true; // keep nameless entries
      if (seen.has(c.email.toLowerCase())) return false;
      seen.add(c.email.toLowerCase());
      return true;
    });

    return NextResponse.json({
      scanned: messages.length,
      skipped: skippedCount,
      contacts: dedupedContacts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
