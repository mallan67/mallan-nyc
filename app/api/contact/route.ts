import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { sendEmail } from '@/lib/email/sendgrid';
import prisma from '@/lib/prisma';
import { escapeHtml } from '@/lib/sanitize';

/**
 * Contact Form API - TCPA-Safe Implementation
 *
 * Compliance requirements:
 * - No autoresponders (manual follow-up only)
 * - No SMS sending
 * - No CRM automation
 * - Store consent timestamp for compliance records
 * - Minimal data collection
 *
 * Storage: JSON file for Phase 1 (can migrate to DB later)
 */

export const dynamic = 'force-dynamic';

interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  phone?: string;
  message: string;
  consentTimestamp: string;
  receivedAt: string;
  status: 'new' | 'read' | 'replied';
}

const DATA_DIR = path.join(process.cwd(), 'data');
const CONTACTS_FILE = path.join(DATA_DIR, 'contact-submissions.json');

// Validation helpers
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeString(str: string, maxLength: number): string {
  return str.trim().slice(0, maxLength).replace(/[<>]/g, '');
}

function generateId(): string {
  return `contact_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function readContacts(): Promise<ContactSubmission[]> {
  try {
    const data = await fs.readFile(CONTACTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeContacts(contacts: ContactSubmission[]) {
  await ensureDataDir();
  await fs.writeFile(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!body.email || typeof body.email !== 'string' || !isValidEmail(body.email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!body.consentTimestamp || typeof body.consentTimestamp !== 'string') {
      return NextResponse.json({ error: 'Consent is required' }, { status: 400 });
    }

    // Validate consent timestamp is recent (within last 5 minutes)
    const consentTime = Date.parse(body.consentTimestamp);
    if (isNaN(consentTime) || Date.now() - consentTime > 5 * 60 * 1000) {
      return NextResponse.json({ error: 'Invalid consent' }, { status: 400 });
    }

    // Create submission record
    const submission: ContactSubmission = {
      id: generateId(),
      name: sanitizeString(body.name, 100),
      email: sanitizeString(body.email, 254).toLowerCase(),
      phone: body.phone ? sanitizeString(body.phone, 20) : undefined,
      message: sanitizeString(body.message, 2000),
      consentTimestamp: body.consentTimestamp,
      receivedAt: new Date().toISOString(),
      status: 'new',
    };

    // Store submission (JSON file — legacy, kept for backward compat)
    const contacts = await readContacts();
    contacts.unshift(submission);
    await writeContacts(contacts);

    // Also store in database as a Lead record
    const nameParts = submission.name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    try {
      const lead = await prisma.lead.upsert({
        where: { email: submission.email },
        create: {
          first_name: firstName,
          last_name: lastName,
          email: submission.email,
          phone: submission.phone || '',
          roles: ['buyer'],
          status: 'new',
          source: 'contact_form',
        },
        update: {
          phone: submission.phone || undefined,
          updated_at: new Date(),
        },
      });

      await prisma.auditEvent.create({
        data: {
          action: 'contact_form_submitted',
          entity_type: 'lead',
          entity_id: lead.id.toString(),
          user_type: 'public',
          user_id: null,
          changes: {
            message: submission.message,
            consent_timestamp: submission.consentTimestamp,
            source: 'contact_form',
          },
        },
      });
    } catch (dbErr) {
      // Non-fatal — JSON file is the backup
      console.error('[CONTACT] DB upsert error (non-fatal):', dbErr);
    }

    // Log for Vercel dashboard visibility (redacted PII)
    console.log(`[CONTACT] New submission id=${submission.id} at ${submission.receivedAt}`);

    // Send email notification (non-fatal — don't fail the API response if email fails)
    try {
      const subjectLine = `New Contact Form: ${submission.name}`;
      const td = 'padding:4px 12px 4px 0;font-weight:bold;';
      const emailBody = `
        <h2>New Contact Form Submission</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;">
          <tr><td style="${td}">Name:</td><td>${escapeHtml(submission.name)}</td></tr>
          <tr><td style="${td}">Email:</td><td>${escapeHtml(submission.email)}</td></tr>
          ${submission.phone ? `<tr><td style="${td}">Phone:</td><td>${escapeHtml(submission.phone)}</td></tr>` : ''}
          <tr><td style="${td}">Message:</td><td>${escapeHtml(submission.message)}</td></tr>
          <tr><td style="${td}">Received:</td><td>${submission.receivedAt}</td></tr>
        </table>
      `.trim();

      console.log('[CONTACT] Sending email notification...');
      const emailResult = await sendEmail('info@mallan.nyc', subjectLine, emailBody);
      console.log(`[CONTACT] Email ${emailResult.success ? 'sent' : 'failed'}:`, emailResult.messageId || emailResult.error);
    } catch (emailErr) {
      console.error('[CONTACT] Email notification error (non-fatal):', emailErr);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[CONTACT] Error processing submission:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// GET - Admin endpoint to retrieve submissions (requires broker auth)
export async function GET(request: NextRequest) {
  // Require valid admin key — reject if missing or wrong
  const authHeader = request.headers.get('x-admin-key');
  if (!authHeader || authHeader !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const contacts = await readContacts();
    return NextResponse.json(contacts);
  } catch (error) {
    console.error('[CONTACT] Error reading submissions:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
