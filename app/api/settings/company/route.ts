// /api/settings/company — Footer + hero + legal links configuration.
// Storage: CompanySetting table (singleton key="company"). Replaces filesystem
// persistence (data/company-settings.json) which did not survive Vercel serverless
// restarts and was susceptible to read-only filesystem errors.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireBroker, isAuthError, logAuditEvent } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

const SETTINGS_KEY = 'company';

type CompanySettings = {
  companyName: string;
  license: string;
  phone: string;
  address: { street: string; city: string; state: string; zip: string };
  heroImage: string;
  heroTagline: string;
  legalLinks: { title: string; href: string }[];
  quickLinks: { title: string; href: string }[];
  resourceLinks: { title: string; href: string }[];
};

// Fallback used when no row exists yet (first-run on a fresh DB).
const DEFAULT_SETTINGS: CompanySettings = {
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

async function getSettings(): Promise<CompanySettings> {
  const row = await prisma.companySetting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return DEFAULT_SETTINGS;
  // value is Prisma.JsonValue — trust the shape since only brokers can write it
  return row.value as unknown as CompanySettings;
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
      (k) => JSON.stringify(body[k]) !== JSON.stringify((currentSettings as Record<string, unknown>)[k])
    );

    const updatedSettings: CompanySettings = { ...currentSettings, ...body };

    await prisma.companySetting.upsert({
      where: { key: SETTINGS_KEY },
      create: {
        key: SETTINGS_KEY,
        value: updatedSettings as unknown as import('@prisma/client').Prisma.InputJsonValue,
        updated_by: auth.userId,
      },
      update: {
        value: updatedSettings as unknown as import('@prisma/client').Prisma.InputJsonValue,
        updated_by: auth.userId,
      },
    });

    await logAuditEvent('update', 'company_settings', SETTINGS_KEY, auth, { changed_fields: changedFields }, ip);
    return NextResponse.json({ settings: updatedSettings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('[/api/settings/company] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
