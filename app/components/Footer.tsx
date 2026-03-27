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
      .catch(() => {});
  }, []);

  const currentYear = new Date().getFullYear();
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <footer role="contentinfo" aria-label="Site footer" className="px-6 md:px-12 lg:px-20 pt-6 md:pt-8 pb-3 md:pb-4 border-t border-black/5">
      <div className="max-w-[1440px] mx-auto">
        {/* Main grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 md:gap-10 mb-6">
          {/* Company */}
          <div>
            <p className="font-display font-bold text-sm mb-3 text-brand-dark">
              MALLAN<span className="font-light text-brand-gold-deep">NYC</span>
            </p>
            <p className="text-brand-dark/90 text-[13px] font-light leading-relaxed">
              {settings.companyName}<br />
              {settings.address.street}<br />
              {settings.address.city}, {settings.address.state} {settings.address.zip}
            </p>
            <p className="text-brand-dark/90 text-[13px] font-light mt-2">
              License #{settings.license}
            </p>
            {/* Social Media */}
            <div className="flex gap-3 mt-4">
              <a href="https://www.instagram.com/mallanrealestate/" target="_blank" rel="noopener noreferrer" aria-label="Follow us on Instagram" className="text-brand-dark/90 hover:text-brand-gold-deep transition-colors duration-500">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a href="https://www.facebook.com/MAllanrealestate" target="_blank" rel="noopener noreferrer" aria-label="Follow us on Facebook" className="text-brand-dark/90 hover:text-brand-gold-deep transition-colors duration-500">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a href="https://www.linkedin.com/company/mallan-real-estate-inc/" target="_blank" rel="noopener noreferrer" aria-label="Follow us on LinkedIn" className="text-brand-dark/90 hover:text-brand-gold-deep transition-colors duration-500">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
              <a href="https://x.com/NYCondos" target="_blank" rel="noopener noreferrer" aria-label="Follow us on X" className="text-brand-dark/90 hover:text-brand-gold-deep transition-colors duration-500">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
            </div>
          </div>

          {/* Search */}
          <div>
            <p className="text-[11px] font-medium text-brand-dark/90 uppercase tracking-widest mb-3">Search</p>
            {settings.quickLinks.map((link) => (
              <Link key={link.href} href={link.href} className="block text-[13px] font-light text-brand-dark/90 hover:text-brand-dark mb-3 transition-all duration-500">
                {link.title}
              </Link>
            ))}
            <Link href="/neighborhoods" className="block text-[13px] font-light text-brand-dark/90 hover:text-brand-dark mb-3 transition-all duration-500">
              Neighborhoods
            </Link>
            <Link href="/open-houses" className="block text-[13px] font-light text-brand-dark/90 hover:text-brand-dark mb-3 transition-all duration-500">
              Open Houses
            </Link>
            <Link href="/search?view=buildings" className="block text-[13px] font-light text-brand-dark/90 hover:text-brand-dark mb-3 transition-all duration-500">
              Buildings
            </Link>
          </div>

          {/* Company */}
          <div>
            <p className="text-[11px] font-medium text-brand-dark/90 uppercase tracking-widest mb-3">Company</p>
            <Link href="/about" className="block text-[13px] font-light text-brand-dark/90 hover:text-brand-dark mb-3 transition-all duration-500">About</Link>
            <Link href="/agents" className="block text-[13px] font-light text-brand-dark/90 hover:text-brand-dark mb-3 transition-all duration-500">Agents</Link>
            {settings.resourceLinks.map((link) => (
              <Link key={link.href} href={link.href} className="block text-[13px] font-light text-brand-dark/90 hover:text-brand-dark mb-3 transition-all duration-500">
                {link.title}
              </Link>
            ))}
            <Link href="/contact" className="block text-[13px] font-light text-brand-dark/90 hover:text-brand-dark mb-3 transition-all duration-500">Contact</Link>
          </div>

          {/* Legal */}
          <div>
            <p className="text-[11px] font-medium text-brand-dark/90 uppercase tracking-widest mb-3">Legal</p>
            {settings.legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="block text-[13px] font-light text-brand-dark/90 hover:text-brand-dark mb-3 transition-all duration-500">
                {link.title}
              </Link>
            ))}
          </div>
        </div>

        {/* Fair Housing & REBNY Compliance — compact */}
        <div className="border-t border-black/5 pt-3 mb-2">
          <div className="flex flex-wrap items-center justify-center gap-3 mb-2">
            <Image src="/images/equal-housing-logo.svg" alt="Equal Housing Opportunity" width={20} height={20} className="w-5 h-5" unoptimized />
            <p className="text-[11px] text-brand-dark/85 font-light">Equal Housing Opportunity</p>
            <span className="text-brand-dark/20">|</span>
            <Link href="/fair-housing" className="text-[11px] text-brand-gold-deep hover:underline font-light">
              Fair Housing Policy
            </Link>
          </div>

          <p className="text-[10px] text-brand-dark/60 font-light max-w-4xl mx-auto leading-relaxed text-center">
            <strong className="font-medium">REBNY RLS:</strong> Listings may be provided by REBNY RLS. Data deemed reliable but not guaranteed. Updated: {currentDate}.
            {' '}<strong className="font-medium">IDX:</strong> For consumers&apos; personal, non-commercial use only.
            {' '}<strong className="font-medium">Fair Housing:</strong> All listings comply with federal, NY State, and NYC fair housing laws.
          </p>
        </div>

        {/* Copyright */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2">
          <p className="text-[11px] font-light text-brand-dark/85">
            &copy; {currentYear} {settings.companyName} &middot; License #{settings.license}
          </p>
          <div className="flex items-center gap-3">
            <Link href="/admin/login" aria-label="Admin" className="opacity-20 hover:opacity-40 transition-opacity duration-500">
              <Image src="/images/mallan-m-icon.png" alt="" width={16} height={16} className="w-4 h-4" unoptimized />
            </Link>
            <p className="text-[10px] font-light text-brand-dark/85 tracking-wider">Equal Housing Opportunity</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
