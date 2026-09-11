import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/urbanist/wght.css';
import '@fontsource-variable/inter/wght.css';
import './globals.css';
import CookieConsent from './components/CookieConsent';
import ExitIntentPopup from './components/ExitIntentPopup';
import SkipLink from './components/SkipLink';
import Analytics from './components/Analytics';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics as VercelAnalytics } from '@vercel/analytics/next';
import BehavioralTracker from './components/BehavioralTracker';
import IntentTracker from './components/IntentTracker';
import SoftIdentityCapture from './components/SoftIdentityCapture';
import ErrorBoundary from './components/ErrorBoundary';
import AuthProvider from './components/AuthProvider';
import Header from './components/Header';
import Footer from './components/Footer';
import FavoriteEmailProvider from './components/FavoriteEmailProvider';
import RegistrationGate from './components/RegistrationGate';
import PostHogProvider from './components/PostHogProvider';

const BASE_URL = 'https://mallan.nyc';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Mallan Real Estate Inc. | Licensed NYC Real Estate Broker',
    template: '%s | Mallan Real Estate Inc.',
  },
  description:
    'Full-service NYC real estate brokerage specializing in residential sales and rentals across Manhattan and Brooklyn. Licensed Real Estate Broker #10991205323.',
  keywords: [
    'NYC real estate',
    'Manhattan apartments',
    'Brooklyn real estate',
    'NYC rentals',
    'New York real estate broker',
  ],
  authors: [{ name: 'Mallan Real Estate Inc.' }],
  creator: 'Mallan Real Estate Inc.',
  publisher: 'Mallan Real Estate Inc.',
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: BASE_URL,
    siteName: 'Mallan Real Estate Inc.',
    title: 'Mallan Real Estate Inc. | Licensed NYC Real Estate Broker',
    description:
      'Full-service NYC real estate brokerage specializing in residential sales and rentals across Manhattan and Brooklyn.',
    images: [
      {
        url: `${BASE_URL}/images/og-default.png`,
        width: 1200,
        height: 630,
        alt: 'Mallan Real Estate Inc. - Licensed NYC Real Estate Broker',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@NYCondos',
    creator: '@NYCondos',
    title: 'Mallan Real Estate Inc. | Licensed NYC Real Estate Broker',
    description:
      'Full-service NYC real estate brokerage specializing in residential sales and rentals across Manhattan and Brooklyn.',
    images: [`${BASE_URL}/images/og-default.png`],
  },
  // Rich-result directives only. NO blanket index/follow - deliberately.
  //
  // This used to assert `index: true, follow: true` at the top level and again
  // under googleBot. Root metadata is inherited by EVERY render, including
  // error renders, so the "Agent Not Found" page emitted two contradictory
  // directives at once:
  //
  //     <meta name="robots" content="noindex"/>          <- Next, for status 404
  //     <meta name="robots" content="index, follow"/>    <- inherited from here
  //
  // Crawlers resolve to the most restrictive, so the effective state was safe,
  // but a page telling a crawler both things is not release truth. It is also
  // not fixable from the page: when notFound() is thrown, the page's own
  // generateMetadata result is discarded and the ROOT metadata is what renders
  // - measured on Next.js 16.2.4, setting robots on the not-found branch of
  // generateMetadata changed nothing at all.
  //
  // Dropping index/follow costs nothing. Absent a robots meta, a page is
  // indexable and followable by default, so healthy pages behave exactly as
  // before; they simply stop restating the default. The 404 now emits Next's
  // single automatic `noindex` and nothing that argues with it.
  //
  // The max-* preview directives are real instructions, not defaults, so they
  // stay. They sit on the `googlebot` meta, which is a different directive
  // class and does not contradict a noindex.
  //
  // VERIFIED (build + serve, Next 16.2.4): a page that sets its own
  // `robots: { index: false, follow: false }` - the /agents temporarily-
  // unavailable branches - still emits `noindex, nofollow` intact. Page-level
  // robots replaces this object rather than merging with it.
  robots: {
    googleBot: {
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'google02f488e9e5e76e5a',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' },
      { url: '/images/mallan-m-icon.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/images/mallan-logo.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

// JSON-LD structured data for RealEstateAgent + founder Person
// Enhanced for AI search discoverability (GEO — Generative Engine Optimization)
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'RealEstateAgent',
  '@id': `${BASE_URL}/#organization`,
  name: 'Mallan Real Estate Inc.',
  url: BASE_URL,
  logo: `${BASE_URL}/images/og-default.png`,
  image: `${BASE_URL}/images/og-default.png`,
  description:
    'Full-service NYC real estate brokerage specializing in luxury residential sales and rentals across Manhattan, Brooklyn, Queens, Bronx, and Staten Island. 110+ verified transactions. REBNY RLS participant.',
  telephone: '+1-646-258-4460',
  email: 'maya@mallan.nyc',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '400 East 90th Street, Suite 17C',
    addressLocality: 'New York',
    addressRegion: 'NY',
    postalCode: '10128',
    addressCountry: 'US',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 40.7794,
    longitude: -73.9491,
  },
  areaServed: [
    {
      '@type': 'City',
      name: 'New York',
      sameAs: 'https://en.wikipedia.org/wiki/New_York_City',
    },
    { '@type': 'AdministrativeArea', name: 'Manhattan' },
    { '@type': 'AdministrativeArea', name: 'Brooklyn' },
    { '@type': 'AdministrativeArea', name: 'Queens' },
    { '@type': 'AdministrativeArea', name: 'Bronx' },
    { '@type': 'AdministrativeArea', name: 'Staten Island' },
  ],
  // Tells AI models what topics this business is authoritative on
  knowsAbout: [
    'NYC real estate',
    'Manhattan condos',
    'Manhattan co-ops',
    'NYC luxury apartments',
    'Battery Park City real estate',
    'Carnegie Hill real estate',
    'Chelsea real estate',
    'Chinatown real estate',
    'Civic Center real estate',
    'East Harlem real estate',
    'East Village real estate',
    'Financial District real estate',
    'Flatiron real estate',
    'Gramercy Park real estate',
    'Greenwich Village real estate',
    "Hell's Kitchen real estate",
    'Kips Bay real estate',
    'Lenox Hill real estate',
    'Little Italy real estate',
    'Lower East Side real estate',
    'Midtown East real estate',
    'Midtown South real estate',
    'Midtown West real estate',
    'Murray Hill real estate',
    'NoHo real estate',
    'Nolita real estate',
    'NoMad real estate',
    'SoHo real estate',
    'Stuyvesant Town real estate',
    'Sugar Hill real estate',
    'Sutton Place real estate',
    'Tribeca real estate',
    'Tudor City real estate',
    'Turtle Bay real estate',
    'Two Bridges real estate',
    'Union Square real estate',
    'Upper East Side real estate',
    'Upper West Side real estate',
    'Washington Heights real estate',
    'West Harlem real estate',
    'West Village real estate',
    'Yorkville real estate',
    'Morningside Heights real estate',
    'NYC rentals',
    'Brooklyn real estate',
    'first-time homebuyers NYC',
    'NYC townhouses',
    'new construction NYC',
    'relocation to New York City',
    '1031 tax exchange',
    'commercial real estate NYC',
    'international real estate investment',
  ],
  priceRange: '$$$$',
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '18:00',
    },
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Saturday', 'Sunday'],
      opens: '10:00',
      closes: '16:00',
    },
  ],
  sameAs: [
    'https://www.instagram.com/mallanrealestate/',
    'https://www.facebook.com/MAllanrealestate',
    'https://www.tiktok.com/@mallannyc',
    'https://www.linkedin.com/company/mallan-real-estate-inc/',
    'https://x.com/NYCondos',
    'https://www.zillow.com/profile/Maya%20Allan',
    'https://streeteasy.com/profile/818487-maya-allan',
    'https://www.yelp.com/biz/mallan-real-estate-new-york',
    'https://www.linkedin.com/in/mayaallan/',
  ],
  // Brokerage license
  hasCredential: [
    {
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'license',
      name: 'NY Real Estate Brokerage License',
      recognizedBy: {
        '@type': 'Organization',
        name: 'New York Department of State',
      },
      identifier: '10991205323',
    },
  ],
  // Also keep identifier for backward compat
  identifier: {
    '@type': 'PropertyValue',
    name: 'NY Real Estate Broker License',
    value: '10991205323',
  },
  // Memberships
  memberOf: [
    {
      '@type': 'Organization',
      name: 'Real Estate Board of New York (REBNY)',
      sameAs: 'https://www.rebny.com',
    },
    {
      '@type': 'Organization',
      name: 'National Association of Realtors (NAR)',
    },
  ],
  // Founder — a REFERENCE to Maya Allan's canonical Agent profile, and nothing
  // more.
  //
  // This block used to publish a complete professional identity on EVERY page
  // of the site: `jobTitle: 'Licensed Real Estate Broker'`, her individual NY
  // DOS broker licence #10311201806 as an EducationalOccupationalCredential, a
  // degree, direct telephone and email, awards, and a knowsAbout expertise
  // list. All of it hard-coded, none of it derived from the Agent record.
  //
  // That made the root layout a SECOND public professional-identity authority,
  // competing with lib/agents/public-profile-authority.ts. It is the same
  // defect class as the duplicate designation rule removed from
  // /api/auth/me: two places asserting what a licensee is, only one of them
  // governed. A designation or licence that the Agent record no longer supports
  // is a false statement about a licensee under NY DOS 19 NYCRR 175.25, and a
  // static payload cannot be corrected by deactivating an agent.
  //
  // It was wrong while the database was HEALTHY, not merely during an outage —
  // but the outage case is the sharpest: /agents, /agents/[name] and
  // /agents/[name]/listings all correctly refuse to publish a stale identity
  // when the authority cannot answer, while this kept publishing one from Git
  // on every other page of the site.
  //
  // THE AUTHORITY BOUNDARY
  //   brokerage-level canonical facts  -> may live here (name, address, the
  //                                       BROKERAGE licence #10991205323,
  //                                       REBNY/NAR membership — all above)
  //   individual professional identity -> the governed Agent profile only
  //
  // What remains is a relationship, not a restatement: who founded the
  // brokerage, and where her canonical profile lives. No jobTitle, no licence,
  // no credential, no individual contact details, no awards. The full Person
  // schema belongs on /agents/maya-allan, rendered from the Agent record when
  // that record is available — and deliberately absent when it is not.
  founder: {
    '@type': 'Person',
    '@id': `${BASE_URL}/#maya-allan`,
    name: 'Maya Allan',
    url: `${BASE_URL}/agents/maya-allan`,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Static-compatible: the root layout no longer reads headers()/x-nonce, so it
  // does NOT force every public route to render dynamically. CSP is now a static
  // header (proxy.ts + security-headers.ts) — a non-nonce policy that relies on
  // 'unsafe-inline' for Next's inline hydration scripts. (Build-time Subresource
  // Integrity was tested but removed in PR #511; it broke script loading under
  // Next 16.2/Turbopack.) The JSON-LD below is a non-executed data block, so it
  // needs no nonce to satisfy CSP.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0f172a" />
        {/* Preconnect to external domains for faster resource loading */}
        {/* translate.google.com loaded dynamically by Header after hydration */}
        <link rel="preconnect" href="https://api.cotality.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.cotality.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Google Translate — loaded after hydration via Header component to prevent React Error #418/#300 */}
      </head>
      <body className="antialiased font-sans" suppressHydrationWarning>
        <SkipLink />
        <AuthProvider>
          <ErrorBoundary>
            <FavoriteEmailProvider>
              <Header />
              <main id="main-content" tabIndex={-1}>
                {children}
              </main>
              <Footer />
            </FavoriteEmailProvider>
          </ErrorBoundary>
        </AuthProvider>
        <CookieConsent />
        <ExitIntentPopup />
        <RegistrationGate />
        <BehavioralTracker />
        <IntentTracker />
        <SoftIdentityCapture />
        <Analytics />
        <SpeedInsights />
        <VercelAnalytics />
        <PostHogProvider />
      </body>
    </html>
  );
}
