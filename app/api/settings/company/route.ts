// /api/settings/company — Footer + hero + legal links configuration.
//
// NOTE: Reverted to filesystem persistence until the CompanySetting migration
// can be applied (blocked by Neon compute quota). On Vercel serverless writes
// go to ephemeral storage, so in practice GET returns DEFAULT_SETTINGS and
// POST from the broker dashboard is effectively session-scoped. That matches
// the behavior pre-2026-04-19 and is acceptable until the schema lands.
import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { requireBroker, isAuthError, logAuditEvent } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'company-settings.json');

// Default company settings
const DEFAULT_SETTINGS = {
  companyName: 'Mallan Real Estate Inc.',
  license: '10991205323',
  phone: '646-258-4460',
  address: {
    street: '400 East 90th Street, Suite 17C',
    city: 'New York',
    state: 'NY',
    zip: '10128',
  },
  heroImage: '/images/hero.jpg',
  heroTagline: 'One Search. Every Space. Home. Business.',
  legalLinks: [
    { title: 'Fair Housing', href: '/fair-housing' },
    { title: 'Privacy Policy', href: '/privacy' },
    { title: 'Terms of Service', href: '/terms' },
    { title: 'Standardized Operating Procedures', href: '/sop' },
    { title: 'Reasonable Accommodations', href: '/reasonable-accommodations' },
  ],
  quickLinks: [
    { title: 'Buy', href: '/buy' },
    { title: 'Rent', href: '/rent' },
    { title: 'Sell', href: '/sell' },
    { title: 'Agents', href: '/agents' },
  ],
  resourceLinks: [
    { title: "Buyer's Guide", href: '/resources/buyers-guide' },
    { title: "Seller's Guide", href: '/resources/sellers-guide' },
    { title: 'Open Houses', href: '/open-houses' },
  ],
};

async function getSettings() {
  try {
    const data = await readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function saveSettings(settings: typeof DEFAULT_SETTINGS) {
  const dir = path.dirname(SETTINGS_FILE);
  const { mkdir } = await import('fs/promises');
  await mkdir(dir, { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function POST(request: NextRequest) {
  const auth = await requireBroker(request);
  if (isAuthError(auth)) return auth;

  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  try {
    const body = await request.json();
    const currentSettings = await getSettings();
    const changedFields = Object.keys(body).filter(
      (k) => JSON.stringify(body[k]) !== JSON.stringify(currentSettings[k])
    );
    await logAuditEvent('update', 'company_settings', 'company', auth, { changed_fields: changedFields }, ip);
    const updatedSettings = { ...currentSettings, ...body };
    await saveSettings(updatedSettings);
    return NextResponse.json({ settings: updatedSettings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('[/api/settings/company] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
