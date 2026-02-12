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
    <footer className="bg-white border-t border-gray-200">
      {/* Main Footer Content */}
      <div className="py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-6 sm:gap-8 text-sm">
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
              {/* Social Media Links */}
              <div className="flex gap-3 mt-3">
                <a href="https://www.instagram.com/mallanrealestate/" target="_blank" rel="noopener noreferrer" aria-label="Follow us on Instagram" className="text-gray-400 hover:text-brand-gold transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </a>
                <a href="https://www.facebook.com/MAllanrealestate" target="_blank" rel="noopener noreferrer" aria-label="Follow us on Facebook" className="text-gray-400 hover:text-brand-gold transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
                <a href="https://www.tiktok.com/@mallannyc" target="_blank" rel="noopener noreferrer" aria-label="Follow us on TikTok" className="text-gray-400 hover:text-brand-gold transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
                </a>
                <a href="https://wa.me/16462584460" target="_blank" rel="noopener noreferrer" aria-label="Contact us on WhatsApp" className="text-gray-400 hover:text-brand-gold transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </a>
                <a href="https://www.linkedin.com/company/mallan-real-estate-inc/" target="_blank" rel="noopener noreferrer" aria-label="Follow us on LinkedIn" className="text-gray-400 hover:text-brand-gold transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
                <a href="https://x.com/NYCondos" target="_blank" rel="noopener noreferrer" aria-label="Follow us on X" className="text-gray-400 hover:text-brand-gold transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
              </div>
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

            {/* Neighborhoods */}
            <div>
              <h4 className="font-medium mb-3 sm:mb-4 text-brand-slate/80">Neighborhoods</h4>
              <ul className="space-y-2 text-gray-600">
                <li><Link href="/manhattan" className="hover:text-brand-gold">Manhattan</Link></li>
                <li><Link href="/brooklyn" className="hover:text-brand-gold">Brooklyn</Link></li>
                <li><Link href="/queens" className="hover:text-brand-gold">Queens</Link></li>
                <li><Link href="/bronx" className="hover:text-brand-gold">Bronx</Link></li>
                <li><Link href="/staten-island" className="hover:text-brand-gold">Staten Island</Link></li>
                <li><Link href="/neighborhoods" className="hover:text-brand-gold font-medium">View All</Link></li>
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
      <div className="bg-white border-t border-gray-200 py-6 px-4">
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
