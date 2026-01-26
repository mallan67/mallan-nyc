'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

type ResourceItem = { title: string; href: string };

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function Dropdown({ label, items, isOpen, onToggle }: { label: string; items: { title: string; href: string }[]; isOpen: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (isOpen) onToggle();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onToggle]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={onToggle}
        className="flex items-center gap-1 hover:text-brand-gold transition-colors"
      >
        {label}
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-md shadow-lg min-w-[180px] z-50">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-2 text-sm text-gray-800 hover:bg-gray-100 first:rounded-t-md last:rounded-b-md"
            >
              {item.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [rentOpen, setRentOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [exclusivesOpen, setExclusivesOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [resources, setResources] = useState<ResourceItem[]>([
    { title: "Buyer's Guide", href: '/resources/buyers-guide' },
    { title: "Seller's Guide", href: '/resources/sellers-guide' },
    { title: 'Investors Guide', href: '/resources/investors-guide' },
  ]);

  useEffect(() => {
    fetch('/api/resources')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setResources(data);
        }
      })
      .catch(() => {
        // Keep default resources on error
      });
  }, []);

  const closeAllDropdowns = () => {
    setBuyOpen(false);
    setRentOpen(false);
    setSellOpen(false);
    setExclusivesOpen(false);
    setResourcesOpen(false);
  };

  const buyItems = [
    { title: 'Residential', href: '/buy?type=residential' },
    { title: 'Commercial', href: '/buy?type=commercial' },
  ];

  const rentItems = [
    { title: 'Residential', href: '/rent?type=residential' },
    { title: 'Commercial', href: '/rent?type=commercial' },
  ];

  const sellItems = [
    { title: 'Residential', href: '/sell?type=residential' },
    { title: 'Commercial', href: '/sell?type=commercial' },
  ];

  const exclusivesItems = [
    { title: 'Mallan Listings', href: '/exclusives/mallan-listings' },
    { title: 'Private Exclusives', href: '/exclusives/private' },
    { title: 'Coming Soon', href: '/exclusives/coming-soon' },
  ];

  return (
    <header className="absolute top-0 left-0 right-0 z-40">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Brand */}
          <Link href="/" className="text-white font-serif text-2xl lg:text-3xl font-bold tracking-wide">
            Mallan Real Estate Inc.
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-8 text-base font-serif text-white" aria-label="Main navigation">
            <Dropdown
              label="Buy"
              items={buyItems}
              isOpen={buyOpen}
              onToggle={() => {
                closeAllDropdowns();
                setBuyOpen(!buyOpen);
              }}
            />

            <Dropdown
              label="Rent"
              items={rentItems}
              isOpen={rentOpen}
              onToggle={() => {
                closeAllDropdowns();
                setRentOpen(!rentOpen);
              }}
            />

            <Dropdown
              label="Sell"
              items={sellItems}
              isOpen={sellOpen}
              onToggle={() => {
                closeAllDropdowns();
                setSellOpen(!sellOpen);
              }}
            />

            <Dropdown
              label="Exclusives"
              items={exclusivesItems}
              isOpen={exclusivesOpen}
              onToggle={() => {
                closeAllDropdowns();
                setExclusivesOpen(!exclusivesOpen);
              }}
            />

            <Link href="/open-houses" className="hover:text-brand-gold transition-colors">
              Open Houses
            </Link>

            <Dropdown
              label="Resources"
              items={resources}
              isOpen={resourcesOpen}
              onToggle={() => {
                closeAllDropdowns();
                setResourcesOpen(!resourcesOpen);
              }}
            />

            <Link href="/agents" className="hover:text-brand-gold transition-colors">
              Agents
            </Link>

            <Link href="/about" className="hover:text-brand-gold transition-colors">
              About Us
            </Link>

            <button className="hover:text-brand-gold transition-colors" aria-label="Search">
              <SearchIcon />
            </button>

            <Link href="/sign-in" className="hover:text-brand-gold transition-colors">
              Sign Up / Sign In
            </Link>
          </nav>

          {/* Mobile menu button */}
          <button
            className="lg:hidden p-2 text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <nav id="mobile-nav" className="lg:hidden py-4 border-t border-white/10 font-serif text-white" aria-label="Mobile navigation">
            <div className="flex flex-col gap-3">
              {/* Buy */}
              <div className="py-2">
                <button
                  onClick={() => setBuyOpen(!buyOpen)}
                  className="flex items-center gap-1 hover:text-brand-gold"
                >
                  Buy
                  <svg className={`w-3 h-3 transition-transform ${buyOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {buyOpen && (
                  <div className="pl-4 mt-2 flex flex-col gap-2">
                    {buyItems.map((item) => (
                      <Link key={item.href} href={item.href} className="text-sm text-white/70 hover:text-brand-gold">
                        {item.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Rent */}
              <div className="py-2">
                <button
                  onClick={() => setRentOpen(!rentOpen)}
                  className="flex items-center gap-1 hover:text-brand-gold"
                >
                  Rent
                  <svg className={`w-3 h-3 transition-transform ${rentOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {rentOpen && (
                  <div className="pl-4 mt-2 flex flex-col gap-2">
                    {rentItems.map((item) => (
                      <Link key={item.href} href={item.href} className="text-sm text-white/70 hover:text-brand-gold">
                        {item.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Sell */}
              <div className="py-2">
                <button
                  onClick={() => setSellOpen(!sellOpen)}
                  className="flex items-center gap-1 hover:text-brand-gold"
                >
                  Sell
                  <svg className={`w-3 h-3 transition-transform ${sellOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {sellOpen && (
                  <div className="pl-4 mt-2 flex flex-col gap-2">
                    {sellItems.map((item) => (
                      <Link key={item.href} href={item.href} className="text-sm text-white/70 hover:text-brand-gold">
                        {item.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Exclusives */}
              <div className="py-2">
                <button
                  onClick={() => setExclusivesOpen(!exclusivesOpen)}
                  className="flex items-center gap-1 hover:text-brand-gold"
                >
                  Exclusives
                  <svg className={`w-3 h-3 transition-transform ${exclusivesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {exclusivesOpen && (
                  <div className="pl-4 mt-2 flex flex-col gap-2">
                    {exclusivesItems.map((item) => (
                      <Link key={item.href} href={item.href} className="text-sm text-white/70 hover:text-brand-gold">
                        {item.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <Link href="/open-houses" className="py-2 hover:text-brand-gold">
                Open Houses
              </Link>

              <div className="py-2">
                <button
                  onClick={() => setResourcesOpen(!resourcesOpen)}
                  className="flex items-center gap-1 hover:text-brand-gold"
                >
                  Resources
                  <svg className={`w-3 h-3 transition-transform ${resourcesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {resourcesOpen && (
                  <div className="pl-4 mt-2 flex flex-col gap-2">
                    {resources.map((item) => (
                      <Link key={item.href} href={item.href} className="text-sm text-white/70 hover:text-brand-gold">
                        {item.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <Link href="/agents" className="py-2 hover:text-brand-gold">
                Agents
              </Link>

              <Link href="/about" className="py-2 hover:text-brand-gold">
                About Us
              </Link>

              <Link href="/sign-in" className="py-2 hover:text-brand-gold">
                Sign Up / Sign In
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
