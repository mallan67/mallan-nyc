'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type ResourceItem = { title: string; href: string };

function ChevronIcon({ open }: { open?: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function NavDropdown({ label, items, dark }: { label: string; items: { title: string; href: string }[]; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const ref = useRef<HTMLDivElement>(null);

  const enter = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };

  const leave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const linkColor = 'text-white/80 hover:text-white';

  return (
    <div ref={ref} className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`inline-flex items-center gap-1 whitespace-nowrap transition-all duration-500 ${linkColor}`}
      >
        {label}
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white/90 backdrop-blur-xl rounded-xl shadow-lg ring-1 ring-black/5 z-50 overflow-hidden whitespace-nowrap">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-brand-dark/60 hover:bg-black/[0.03] hover:text-brand-dark transition-colors font-light"
            >
              {item.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type HeaderProps = {
  dark?: boolean;
};

export default function Header({ dark = false }: HeaderProps = {}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [rentOpen, setRentOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [exclusivesOpen, setExclusivesOpen] = useState(false);
  const [neighborhoodsOpen, setNeighborhoodsOpen] = useState(false);
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
    { title: 'Mallan Exclusives', href: '/buy?exclusive=mallan' },
    { title: 'Private Exclusives', href: '/buy?exclusive=private' },
    { title: 'Coming Soon', href: '/buy?coming-soon=true' },
  ];

  const neighborhoodItems = [
    { title: 'Manhattan', href: '/manhattan' },
    { title: 'Brooklyn', href: '/brooklyn' },
    { title: 'Queens', href: '/queens' },
    { title: 'Bronx', href: '/bronx' },
    { title: 'Staten Island', href: '/staten-island' },
    { title: 'View All', href: '/neighborhoods' },
  ];

  // Homepage: absolute (overlays hero). Inner pages: fixed.
  const positionClass = dark ? 'fixed' : 'absolute';
  const bgClass = mobileOpen
    ? 'bg-[rgba(28,25,23,0.95)] backdrop-blur-2xl'
    : 'nav-glass';

  const mobileDropdownItem = (item: { title: string; href: string }) => (
    <div
      key={item.href}
      onTouchEnd={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMobileOpen(false);
        setTimeout(() => router.push(item.href), 100);
      }}
      onClick={(e) => {
        e.preventDefault();
        setMobileOpen(false);
        router.push(item.href);
      }}
      role="button"
      tabIndex={0}
      className="block py-3 min-h-[44px] text-base cursor-pointer select-none text-white/60 active:text-white"
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        touchAction: 'manipulation'
      }}
    >
      {item.title}
    </div>
  );

  // White text on dark charcoal glass
  const textColor = 'text-white';
  const mobileTextColor = 'text-white/80 hover:text-white';

  return (
    <header className={`${positionClass} top-0 left-0 right-0 z-50 transition-all duration-300 ${bgClass}`}>
      <div className="max-w-[1440px] mx-auto px-6 md:px-12 lg:px-20">
        <div className="flex items-center justify-between h-16 md:h-[72px]">
          {/* Brand — MALLANNYC */}
          <Link
            href="/"
            className={`font-display font-bold text-lg md:text-xl tracking-tight ${textColor} hover:opacity-80 transition-opacity`}
          >
            MALLAN<span className="font-light text-brand-gold-deep gold-glow-text">NYC</span>
          </Link>

          {/* Desktop Nav */}
          <nav
            className="hidden lg:flex items-center ml-auto"
            aria-label="Main navigation"
          >
            <ul className="flex items-center gap-8 lg:gap-10 xl:gap-12 text-[13px] font-light">
              <li><NavDropdown label="Buy" items={buyItems} dark={dark} /></li>
              <li><NavDropdown label="Rent" items={rentItems} dark={dark} /></li>
              <li><NavDropdown label="Sell" items={sellItems} dark={dark} /></li>
              <li><NavDropdown label="Exclusives" items={exclusivesItems} dark={dark} /></li>
              <li><NavDropdown label="Neighborhoods" items={neighborhoodItems} dark={dark} /></li>

              <li>
                <Link href="/open-houses" className="inline-flex items-center whitespace-nowrap transition-all duration-500 text-white/80 hover:text-white">
                  Open Houses
                </Link>
              </li>

              <li><NavDropdown label="Resources" items={resources} dark={dark} /></li>

              <li>
                <Link href="/about" className="inline-flex items-center whitespace-nowrap transition-all duration-500 text-white/80 hover:text-white">
                  About
                </Link>
              </li>

              <li>
                <Link
                  href="/sign-in"
                  className="btn-liquid text-[13px] font-medium bg-white text-brand-dark px-6 py-2.5 rounded-full"
                >
                  Sign In
                </Link>
              </li>
            </ul>
          </nav>

          {/* Mobile menu button */}
          <button
            className={`lg:hidden p-2 ${textColor} z-50`}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <nav id="mobile-nav" className={`lg:hidden py-6 text-lg font-display font-light max-h-[calc(100vh-5rem)] overflow-y-auto`} aria-label="Mobile navigation">
            <div className="flex flex-col gap-1">
              {/* Buy */}
              <div>
                <button
                  type="button"
                  onClick={() => setBuyOpen(!buyOpen)}
                  className={`flex items-center gap-2 w-full py-3 min-h-[44px] ${mobileTextColor}`}
                >
                  Buy
                  <ChevronIcon open={buyOpen} />
                </button>
                {buyOpen && (
                  <div className="pl-4 pb-2 flex flex-col">
                    {buyItems.map(mobileDropdownItem)}
                  </div>
                )}
              </div>

              {/* Rent */}
              <div>
                <button
                  type="button"
                  onClick={() => setRentOpen(!rentOpen)}
                  className={`flex items-center gap-2 w-full py-3 min-h-[44px] ${mobileTextColor}`}
                >
                  Rent
                  <ChevronIcon open={rentOpen} />
                </button>
                {rentOpen && (
                  <div className="pl-4 pb-2 flex flex-col">
                    {rentItems.map(mobileDropdownItem)}
                  </div>
                )}
              </div>

              {/* Sell */}
              <div>
                <button
                  type="button"
                  onClick={() => setSellOpen(!sellOpen)}
                  className={`flex items-center gap-2 w-full py-3 min-h-[44px] ${mobileTextColor}`}
                >
                  Sell
                  <ChevronIcon open={sellOpen} />
                </button>
                {sellOpen && (
                  <div className="pl-4 pb-2 flex flex-col">
                    {sellItems.map(mobileDropdownItem)}
                  </div>
                )}
              </div>

              {/* Exclusives */}
              <div>
                <button
                  type="button"
                  onClick={() => setExclusivesOpen(!exclusivesOpen)}
                  className={`flex items-center gap-2 w-full py-3 min-h-[44px] ${mobileTextColor}`}
                >
                  Exclusives
                  <ChevronIcon open={exclusivesOpen} />
                </button>
                {exclusivesOpen && (
                  <div className="pl-4 pb-2 flex flex-col">
                    {exclusivesItems.map(mobileDropdownItem)}
                  </div>
                )}
              </div>

              {/* Neighborhoods */}
              <div>
                <button
                  type="button"
                  onClick={() => setNeighborhoodsOpen(!neighborhoodsOpen)}
                  className={`flex items-center gap-2 w-full py-3 min-h-[44px] ${mobileTextColor}`}
                >
                  Neighborhoods
                  <ChevronIcon open={neighborhoodsOpen} />
                </button>
                {neighborhoodsOpen && (
                  <div className="pl-4 pb-2 flex flex-col">
                    {neighborhoodItems.map(mobileDropdownItem)}
                  </div>
                )}
              </div>

              <Link
                href="/open-houses"
                onClick={() => setMobileOpen(false)}
                className={`py-3 min-h-[44px] ${mobileTextColor}`}
              >
                Open Houses
              </Link>

              <div>
                <button
                  type="button"
                  onClick={() => setResourcesOpen(!resourcesOpen)}
                  className={`flex items-center gap-2 w-full py-3 min-h-[44px] ${mobileTextColor}`}
                >
                  Resources
                  <ChevronIcon open={resourcesOpen} />
                </button>
                {resourcesOpen && (
                  <div className="pl-4 pb-2 flex flex-col">
                    {resources.map(mobileDropdownItem)}
                  </div>
                )}
              </div>

              <Link
                href="/about"
                onClick={() => setMobileOpen(false)}
                className={`py-3 min-h-[44px] ${mobileTextColor}`}
              >
                About
              </Link>

              <div className="mt-6 pt-6 border-t border-white/10">
                <Link
                  href="/sign-in"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full btn-liquid bg-white text-brand-dark font-medium py-4 rounded-full text-sm text-center"
                >
                  Sign In
                </Link>
                <p className="text-center text-sm font-extralight text-white/30 mt-5">(646) 258-4460</p>
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
