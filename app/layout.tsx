import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Urbanist, Inter } from 'next/font/google';
import './globals.css';
import CookieConsent from './components/CookieConsent';
import ExitIntentPopup from './components/ExitIntentPopup';
import SkipLink from './components/SkipLink';
import Analytics from './components/Analytics';
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

// Bright & Liquid design system fonts
const urbanist = Urbanist({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600'],
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

// JSON-LD structured data for LocalBusiness / RealEstateAgent
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'RealEstateAgent',
  '@id': `${BASE_URL}/#organization`,
  name: 'Mallan Real Estate Inc.',
  url: BASE_URL,
  logo: `${BASE_URL}/images/og-default.png`,
  image: `${BASE_URL}/images/og-default.png`,
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
  sameAs: [
    'https://www.instagram.com/mallanrealestate/',
    'https://www.facebook.com/MAllanrealestate',
    'https://www.tiktok.com/@mallannyc',
    'https://www.linkedin.com/company/mallan-real-estate-inc/',
    'https://x.com/NYCondos',
  ],
  // NY State broker license
  identifier: {
    '@type': 'PropertyValue',
    name: 'NY Real Estate Broker License',
    value: '10991205323',
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? '';

  return (
    <html lang="en" className={`${urbanist.variable} ${inter.variable}`}>
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
      <body className="antialiased font-sans">
        <SkipLink />
        <AuthProvider>
          <ErrorBoundary>
            <FavoriteEmailProvider>
              <Header />
              <div id="main-content">
                {children}
              </div>
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
        <PostHogProvider />
      </body>
    </html>
  );
}
