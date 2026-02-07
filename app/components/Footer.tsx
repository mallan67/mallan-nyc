'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

type LinkItem = { title: string; href: string };

type CompanySettings = {
  companyName: string;
  license: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  legalLinks: LinkItem[];
  quickLinks: LinkItem[];
  resourceLinks: LinkItem[];
};

// Default settings as fallback
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

export default function Footer() {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    fetch('/api/settings/company')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.companyName) {
          setSettings(data);
        }
      })
      .catch(() => {
        // Keep default settings on error
      });
  }, []);

  const currentYear = new Date().getFullYear();
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <footer className="bg-gray-50 border-t border-gray-200">
      {/* Main Footer Content */}
      <div className="py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-sm">
            {/* Company Info */}
            <div className="col-span-2 sm:col-span-2 md:col-span-1">
              <h3 className="font-medium text-black mb-3 sm:mb-4">{settings.companyName}</h3>
              <p className="text-gray-600">
                Licensed Real Estate Broker<br />
                License #{settings.license}<br />
                <a href={`tel:+1${settings.phone.replace(/\D/g, '')}`} className="hover:text-brand-gold">
                  {settings.phone}
                </a><br />
                {settings.address.street}<br />
                {settings.address.city}, {settings.address.state} {settings.address.zip}
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-medium mb-3 sm:mb-4 text-brand-slate/80">Quick Links</h4>
              <ul className="space-y-2 text-gray-600">
                {settings.quickLinks.map((link, index) => (
                  <li key={index}>
                    <Link href={link.href} className="hover:text-brand-gold">
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-medium mb-3 sm:mb-4 text-brand-slate/80">Resources</h4>
              <ul className="space-y-2 text-gray-600">
                {settings.resourceLinks.map((link, index) => (
                  <li key={index}>
                    <Link href={link.href} className="hover:text-brand-gold">
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-medium mb-3 sm:mb-4 text-brand-slate/80">Legal</h4>
              <ul className="space-y-2 text-gray-600">
                {settings.legalLinks.map((link, index) => (
                  <li key={index}>
                    <Link href={link.href} className="hover:text-brand-gold">
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Fair Housing & REBNY Compliance Section */}
      <div className="bg-gray-100 border-t border-gray-200 py-6 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Fair Housing Statement */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-6 pb-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              {/* Equal Housing Opportunity Logo - HUD compliant */}
              <div className="w-12 h-12 bg-white rounded flex items-center justify-center border" aria-hidden="true">
                <Image
                  src="/images/equal-housing-logo.svg"
                  alt=""
                  width={40}
                  height={40}
                  className="w-10 h-10"
                  priority={false}
                  unoptimized
                />
              </div>
              <div className="text-center md:text-left">
                <p className="font-medium text-sm text-gray-800" id="equal-housing-title">Equal Housing Opportunity</p>
                <p className="text-xs text-gray-600" id="equal-housing-desc">
                  We are pledged to the letter and spirit of U.S. policy for fair housing.
                </p>
              </div>
            </div>
            <Link
              href="/fair-housing"
              className="text-xs text-brand-gold hover:underline"
            >
              Read our Fair Housing Policy
            </Link>
          </div>

          {/* REBNY RLS Attribution */}
          <div className="text-center space-y-3">
            <p className="text-xs text-gray-600 max-w-4xl mx-auto">
              <strong>REBNY RLS Attribution:</strong> Listings displayed on this website may be provided
              in part by the Real Estate Board of New York&apos;s Residential Listing Service (REBNY RLS).
              Data is deemed reliable but not guaranteed. Data last updated: {currentDate}.
            </p>
            <p className="text-xs text-gray-500 max-w-4xl mx-auto">
              <strong>IDX Compliance:</strong> This site is controlled by a REBNY RLS participant.
              Listing information is provided for consumers&apos; personal, non-commercial use and may
              not be used for any purpose other than to identify prospective properties consumers
              may be interested in purchasing or renting. No modifications have been made to listing data.
            </p>
            <p className="text-xs text-gray-500 max-w-4xl mx-auto">
              <strong>Fair Housing Notice:</strong> REBNY promotes fair housing practices. All listings
              are presented in compliance with the federal Fair Housing Act, the New York State Human
              Rights Law, and the New York City Human Rights Law, prohibiting discrimination based on
              race, color, religion, national origin, sex, familial status, disability, sexual orientation,
              gender identity or expression, marital status, age, military status, lawful source of income,
              citizenship status, partnership status, caregiver status, immigration status, or any other
              protected characteristic.
            </p>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="bg-brand-dark text-white py-4 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <p>© {currentYear} {settings.companyName} All rights reserved.</p>
          <p className="text-gray-400">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            {' · '}
            <Link href="/terms" className="hover:text-white">Terms</Link>
            {' · '}
            <Link href="/fair-housing" className="hover:text-white">Fair Housing</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
