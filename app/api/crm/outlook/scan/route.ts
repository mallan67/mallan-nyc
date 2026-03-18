// GET /api/crm/outlook/scan
// Scans a mail folder and returns extracted contacts from each email
// Optimized for StreetEasy leads + general introduction emails
// Query: ?folder=FOLDER_ID&top=50&skip=0
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getOutlookToken } from "@/lib/outlook/get-token";
import { getMessages, stripHtml } from "@/lib/outlook/graph-client";

// ── Your own emails to exclude ──────────────────────────────
const MY_EMAILS = [
  "maya@mallannyhomes.com",
  "maya@mallan.nyc",
  "maya.allan",
  "mallannyhomes.com",
  "mallan.nyc",
];

function isMyEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return MY_EMAILS.some((e) => lower.includes(e));
}

// ── Skip automated/service emails ───────────────────────────
const SKIP_SENDERS = [
  "mailer-daemon", "postmaster", "no-reply", "noreply", "donotreply",
  "notifications@", "alerts@", "newsletter@", "marketing@",
  "support@", "info@streeteasy", "billing@", "receipts@",
];

function shouldSkipSender(fromEmail: string): boolean {
  const lower = fromEmail.toLowerCase();
  return SKIP_SENDERS.some((s) => lower.includes(s));
}

// ── Contact result type ─────────────────────────────────────
interface ExtractedContact {
  name: string;
  email: string;
  phone: string;
  role: string;
  property: string;
  price: string;
  neighborhood: string;
  message: string;
  source: string; // "streeteasy" | "direct" | "email"
  source_subject: string;
  source_date: string;
}

// ── StreetEasy Lead Parser ──────────────────────────────────
// Subject: "211 East 51st Street #4C StreetEasy Inquiry From Martin Fried"
// Body has: Name | email | phone, then property card with address, price, beds/baths
function parseStreetEasyLead(subject: string, body: string, date: string): ExtractedContact | null {
  // Extract name from subject
  const subjectMatch = subject.match(/StreetEasy Inquiry From (.+)$/i);
  if (!subjectMatch) return null;

  const name = subjectMatch[1].trim();

  // Extract property address from subject (everything before "StreetEasy")
  const addrMatch = subject.match(/^(.+?)\s+StreetEasy/i);
  const property = addrMatch ? addrMatch[1].trim() : "";

  // Parse body for contact info: "Name | email | phone"
  const plain = stripHtml(body);
  const lines = plain.split("\n").map((l) => l.trim()).filter(Boolean);

  let email = "";
  let phone = "";
  let message = "";
  let price = "";
  let neighborhood = "";

  // Find the contact line: "Martin Fried | martinefried21@gmail.com | +19148061968"
  for (const line of lines) {
    // Contact line with pipes
    if (line.includes("|") && line.includes("@")) {
      const parts = line.split("|").map((p) => p.trim());
      for (const part of parts) {
        if (part.includes("@")) email = part;
        else if (/^\+?\d[\d\s()-]{6,}$/.test(part)) phone = part;
      }
      continue;
    }
    // Standalone email
    if (!email && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(line)) {
      email = line;
      continue;
    }
    // Standalone phone
    if (!phone && /^\+?\d[\d\s().+-]{6,}$/.test(line) && line.replace(/\D/g, "").length >= 7) {
      phone = line;
      continue;
    }
    // Price: "$4,000 base rent" or "$1,200,000"
    const priceMatch = line.match(/\$[\d,]+(?:\s*(?:base rent|\/mo|per month))?/i);
    if (priceMatch && !price) {
      price = priceMatch[0];
      continue;
    }
    // Neighborhood: "CONDO IN TURTLE BAY"
    const hoodMatch = line.match(/(?:CONDO|CO-OP|COOP|TOWNHOUSE|HOUSE|RENTAL|APARTMENT)\s+IN\s+(.+)/i);
    if (hoodMatch && !neighborhood) {
      neighborhood = hoodMatch[1].trim();
      continue;
    }
  }

  // Find the user's message (usually after "You Received a Question" and before the contact line)
  const questionIdx = plain.indexOf("You Received a Question");
  if (questionIdx !== -1) {
    const afterQuestion = plain.substring(questionIdx);
    const msgLines = afterQuestion.split("\n").map((l) => l.trim()).filter(Boolean);
    // Skip header lines, find the actual message
    for (let i = 1; i < msgLines.length; i++) {
      const line = msgLines[i];
      if (line.includes("|") && line.includes("@")) break; // contact line = end of message
      if (line === name) break;
      if (line === "REPLY") break;
      if (/^You Received|^Question About/i.test(line)) continue;
      if (/^\d+\s+\w+\s+\w+\s+Street|Avenue|Blvd/i.test(line)) continue;
      if (line.length > 5 && line.length < 500 && !message) {
        message = line;
      }
    }
  }

  // Determine role from context
  let role = "buyer";
  const fullText = (subject + " " + plain).toLowerCase();
  if (/rent|lease|base rent|\/mo/i.test(fullText)) role = "renter";

  return {
    name,
    email,
    phone,
    role,
    property,
    price,
    neighborhood,
    message,
    source: "streeteasy",
    source_subject: subject,
    source_date: date,
  };
}

// ── General email contact extractor (non-StreetEasy) ────────
// Uses From/To/CC headers, NOT body parsing
function extractHeaderContacts(
  subject: string,
  date: string,
  fromName: string,
  fromEmail: string,
  toRecipients: Array<{ name: string; address: string }>,
  ccRecipients: Array<{ name: string; address: string }>
): ExtractedContact[] {
  const contacts: ExtractedContact[] = [];
  const seen = new Set<string>();

  // Detect role from subject
  const subLower = subject.toLowerCase();
  let role = "unknown";
  if (/tenant|renter|lease|rent/i.test(subLower)) role = "renter";
  else if (/buyer|purchase|offer|pre-approv/i.test(subLower)) role = "buyer";
  else if (/seller|listing|exclusive|cma/i.test(subLower)) role = "seller";
  else if (/landlord|owner/i.test(subLower)) role = "landlord";

  // Add the sender (if not me and not a service)
  if (fromEmail && !isMyEmail(fromEmail) && !shouldSkipSender(fromEmail)) {
    seen.add(fromEmail.toLowerCase());
    contacts.push({
      name: fromName || "",
      email: fromEmail,
      phone: "",
      role,
      property: "",
      price: "",
      neighborhood: "",
      message: "",
      source: "email",
      source_subject: subject,
      source_date: date,
    });
  }

  // Add To/CC recipients (excluding me and services)
  const allRecipients = [...toRecipients, ...ccRecipients];
  for (const r of allRecipients) {
    if (!r.address || isMyEmail(r.address) || shouldSkipSender(r.address)) continue;
    const key = r.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push({
      name: r.name || "",
      email: r.address,
      phone: "",
      role,
      property: "",
      price: "",
      neighborhood: "",
      message: "",
      source: "email",
      source_subject: subject,
      source_date: date,
    });
  }

  return contacts;
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const token = await getOutlookToken(BigInt(auth.userId));
  if (!token) {
    return NextResponse.json({ connected: false, error: "Outlook not connected" }, { status: 200 });
  }

  const folderId = req.nextUrl.searchParams.get("folder");
  if (!folderId) {
    return NextResponse.json({ error: "folder parameter required" }, { status: 400 });
  }

  const top = Math.min(parseInt(req.nextUrl.searchParams.get("top") || "50"), 100);
  const skip = parseInt(req.nextUrl.searchParams.get("skip") || "0");
  const mode = req.nextUrl.searchParams.get("mode") || "all"; // "streeteasy" | "all"

  try {
    const { messages } = await getMessages(token, folderId, top, skip);

    const allContacts: ExtractedContact[] = [];
    let streetEasyCount = 0;
    let generalCount = 0;
    let skippedCount = 0;

    for (const msg of messages) {
      const fromEmail = msg.from?.emailAddress?.address || "";
      const fromName = msg.from?.emailAddress?.name || "";
      const subject = msg.subject || "";

      // StreetEasy lead detection
      if (/streeteasy inquiry from/i.test(subject)) {
        const lead = parseStreetEasyLead(subject, msg.body.content, msg.receivedDateTime || "");
        if (lead) {
          allContacts.push(lead);
          streetEasyCount++;
          continue;
        }
      }

      // Skip automated senders for general extraction
      if (shouldSkipSender(fromEmail)) {
        skippedCount++;
        continue;
      }

      // General contact extraction from headers (if mode is "all")
      if (mode === "all") {
        const toRecipients = (msg.toRecipients || []).map((r) => ({
          name: r.emailAddress.name,
          address: r.emailAddress.address,
        }));
        const ccRecipients = (msg.ccRecipients || []).map((r) => ({
          name: r.emailAddress.name,
          address: r.emailAddress.address,
        }));

        const headerContacts = extractHeaderContacts(
          subject,
          msg.receivedDateTime || "",
          fromName,
          fromEmail,
          toRecipients,
          ccRecipients
        );
        allContacts.push(...headerContacts);
        if (headerContacts.length > 0) generalCount++;
      }
    }

    // Deduplicate by email
    const seen = new Set<string>();
    const dedupedContacts = allContacts.filter((c) => {
      if (!c.email) return false;
      const key = c.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({
      scanned: messages.length,
      skipped: skippedCount,
      streeteasy_leads: streetEasyCount,
      general_contacts: generalCount,
      contacts: dedupedContacts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
