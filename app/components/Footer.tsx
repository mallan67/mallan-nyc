'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

  return (
    <footer className="bg-gray-50 border-t border-gray-200 py-8 sm:py-12 px-4">
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

        <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-gray-200 text-center text-gray-500 text-xs">
          © {new Date().getFullYear()} {settings.companyName} All rights reserved.
        </div>
      </div>
    </footer>
  );
}
