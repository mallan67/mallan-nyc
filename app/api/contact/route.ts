import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

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

    // Store submission
    const contacts = await readContacts();
    contacts.unshift(submission);
    await writeContacts(contacts);

    // Log for Vercel dashboard visibility
    console.log(`[CONTACT] New submission from ${submission.email} at ${submission.receivedAt}`);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[CONTACT] Error processing submission:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// GET - Admin endpoint to retrieve submissions
export async function GET(request: NextRequest) {
  // Basic auth check via header (admin pages will need to implement auth)
  const authHeader = request.headers.get('x-admin-key');

  // For now, allow access without auth (will be behind admin route)
  // In production, add proper authentication
  if (authHeader && authHeader !== process.env.ADMIN_KEY) {
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
