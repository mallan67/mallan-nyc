import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Manrope } from 'next/font/google';
import './globals.css';
import CookieConsent from './components/CookieConsent';
import SkipLink from './components/SkipLink';
import Analytics from './components/Analytics';
import ErrorBoundary from './components/ErrorBoundary';

// Modern premium sans-serif for luxury feel
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

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
        url: `${BASE_URL}/images/og-default.svg`,
        width: 1200,
        height: 630,
        alt: 'Mallan Real Estate Inc. - Licensed NYC Real Estate Broker',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Mallan Real Estate Inc. | Licensed NYC Real Estate Broker',
    description:
      'Full-service NYC real estate brokerage specializing in residential sales and rentals across Manhattan and Brooklyn.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'google02f488e9e5e76e5a',
  },
};

// JSON-LD structured data for LocalBusiness / RealEstateAgent
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'RealEstateAgent',
  '@id': `${BASE_URL}/#organization`,
  name: 'Mallan Real Estate Inc.',
  url: BASE_URL,
  logo: `${BASE_URL}/images/og-default.svg`,
  image: `${BASE_URL}/images/og-default.svg`,
  description:
    'Full-service NYC real estate brokerage specializing in residential sales and rentals across Manhattan and Brooklyn.',
  telephone: '+1-646-258-4460',
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
  sameAs: [],
  // NY State broker license
  identifier: {
    '@type': 'PropertyValue',
    name: 'NY Real Estate Broker License',
    value: '10991205323',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0f172a" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased font-sans">
        <SkipLink />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <CookieConsent />
        <Analytics />
      </body>
    </html>
  );
}
