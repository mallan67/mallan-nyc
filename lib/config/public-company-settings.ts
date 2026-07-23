/**
 * Canonical PUBLIC company settings — single static source for the public shell.
 *
 * WHY (Neon-quiet program, 2026-07-23): Footer and HeroSearch previously
 * fetched GET /api/settings/company on EVERY full page mount. That route reads
 * a filesystem JSON (data/company-settings.json) which does not exist in the
 * repo, so DEFAULT_SETTINGS is the effective production value — meaning every
 * one of those requests was a Vercel function execution that returned a
 * constant. Public components now import THIS module directly (bundled at
 * build): zero network requests, zero function executions, identical values.
 *
 * The broker-only POST path (session-scoped overrides on ephemeral storage)
 * is deliberately untouched; the API route imports these same defaults so the
 * two sources can never drift.
 *
 * Compliance note: companyName/license/phone/address are NY DOS §175.25
 * brokerage-identification values — keep in sync with CLAUDE.md §B.
 */

export interface PublicLink {
  title: string;
  href: string;
}

export interface PublicCompanySettings {
  companyName: string;
  license: string;
  phone: string;
  address: { street: string; city: string; state: string; zip: string };
  heroImage: string;
  heroTagline: string;
  legalLinks: PublicLink[];
  quickLinks: PublicLink[];
  resourceLinks: PublicLink[];
}

export const PUBLIC_COMPANY_SETTINGS: PublicCompanySettings = {
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
