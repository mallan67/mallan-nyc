'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

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

function NavDropdown({ label, items, dark: _dark }: { label: string; items: { title: string; href: string }[]; dark?: boolean }) {
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
              className="block px-4 py-2.5 text-sm text-brand-dark/90 hover:bg-black/[0.03] hover:text-brand-dark transition-colors font-light"
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
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [rentOpen, setRentOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [exclusivesOpen, setExclusivesOpen] = useState(false);
  const [neighborhoodsOpen, setNeighborhoodsOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const resources: ResourceItem[] = [
    { title: 'Market Report', href: '/market' },
    { title: "Buyer's Guide", href: '/resources/buyers-guide' },
    { title: "Seller's Guide", href: '/resources/sellers-guide' },
    { title: 'Investors Guide', href: '/resources/investors-guide' },
  ];

  // Homepage: absolute (overlays hero). Inner pages: fixed.
  const dark = pathname !== '/';

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Resources are static — no fetch needed (avoids 100-200ms per navigation)

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
    { title: 'Home Value', href: '/sell#valuation' },
  ];

  const exclusivesItems = [
    { title: 'Mallan Exclusives', href: '/sign-in' },
    { title: 'Private Exclusives', href: '/sign-in' },
    { title: 'Coming Soon', href: '/sign-in' },
  ];

  const neighborhoodItems = [
    { title: 'Manhattan', href: '/manhattan' },
    { title: 'Brooklyn', href: '/brooklyn' },
    { title: 'Queens', href: '/queens' },
    { title: 'Bronx', href: '/bronx' },
    { title: 'Staten Island', href: '/staten-island' },
    { title: 'View All', href: '/neighborhoods' },
  ];

  const positionClass = dark ? 'fixed' : 'absolute';
  const bgClass = mobileOpen
    ? 'bg-[rgba(20,27,45,0.95)] backdrop-blur-2xl'
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
  const mobileTextColor = 'text-white/80 hover:text-white';

  // Auth-aware button config
  const isLoggedIn = auth.authenticated;
  const isAgent = auth.principalType === 'agent';
  const authLabel = isLoggedIn
    ? (isAgent ? 'CRM' : 'My Portal')
    : 'Sign In';
  const authHref = isLoggedIn
    ? (isAgent ? '/crm/MALLAN-NYC-CRM-FINAL2.html' : '/portal')
    : '/sign-in';

  return (
    <header className={`${positionClass} top-0 left-0 right-0 z-50 transition-all duration-300 ${bgClass}`}>
      <div className="max-w-[1440px] mx-auto px-6 md:px-12 lg:px-20">
        <div className="flex items-center justify-between h-16 md:h-[72px]">
          {/* Brand — MALLANNYC */}
          <Link
            href="/"
            className={`font-display font-bold text-lg md:text-xl tracking-tight text-white hover:opacity-80 transition-opacity`}
          >
            MALLAN<span className="font-light text-brand-gold-deep gold-glow-text">NYC</span>
          </Link>

          {/* Desktop Nav */}
          <nav
            className="hidden lg:flex items-center ml-auto"
            aria-label="Main navigation"
          >
            <ul className="flex items-center gap-5 lg:gap-6 xl:gap-8 text-[13px] font-light">
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
                <Link href="/agents" className="inline-flex items-center whitespace-nowrap transition-all duration-500 text-white/80 hover:text-white">
                  Agents
                </Link>
              </li>

              <li>
                <Link href="/about" className="inline-flex items-center whitespace-nowrap transition-all duration-500 text-white/80 hover:text-white">
                  About
                </Link>
              </li>

              <li>
                <Link href="/favorites" className="inline-flex items-center whitespace-nowrap transition-all duration-500 text-white/80 hover:text-white" title="Saved Properties">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
                </Link>
              </li>

              <li>
                <a href="tel:+16462584460" className="inline-flex items-center gap-1.5 whitespace-nowrap transition-all duration-500 text-white/80 hover:text-white" title="Call (646) 258-4460">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  <span className="hidden xl:inline text-[12px]">(646) 258-4460</span>
                </a>
              </li>

              {/* Google Translate */}
              <li>
                <div id="google_translate_element" className="translate-widget" />
              </li>

              {isLoggedIn ? (
                <li className="relative group">
                  <Link
                    href={authHref}
                    className="btn-liquid text-[13px] font-medium border border-brand-gold text-white px-5 py-2 rounded-full hover:bg-brand-gold hover:text-brand-dark transition-colors"
                  >
                    {authLabel}
                  </Link>
                  <div className="absolute top-full right-0 mt-2 bg-white/90 backdrop-blur-xl rounded-xl shadow-lg ring-1 ring-black/5 z-50 overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                    <Link href={authHref} className="block px-4 py-2.5 text-sm text-brand-dark/90 hover:bg-black/[0.03] hover:text-brand-dark transition-colors whitespace-nowrap">
                      {authLabel}
                    </Link>
                    <button
                      onClick={async () => {
                        await auth.logout();
                        router.push('/sign-in');
                      }}
                      className="block w-full text-left px-4 py-2.5 text-sm text-red-500/70 hover:bg-red-50/50 hover:text-red-600 transition-colors whitespace-nowrap"
                    >
                      Sign Out
                    </button>
                  </div>
                </li>
              ) : (
                <li>
                  <Link
                    href="/sign-in"
                    className="btn-liquid text-[13px] font-medium border border-white/40 text-white px-5 py-2 rounded-full hover:bg-white hover:text-brand-dark transition-colors"
                  >
                    Sign In
                  </Link>
                </li>
              )}
            </ul>
          </nav>

          {/* Mobile menu button */}
          <button
            className={`lg:hidden p-2 text-white z-50`}
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
                href="/agents"
                onClick={() => setMobileOpen(false)}
                className={`py-3 min-h-[44px] ${mobileTextColor}`}
              >
                Agents
              </Link>

              <Link
                href="/about"
                onClick={() => setMobileOpen(false)}
                className={`py-3 min-h-[44px] ${mobileTextColor}`}
              >
                About
              </Link>

              <div className="flex gap-4 mt-2">
                <Link
                  href="/favorites"
                  onClick={() => setMobileOpen(false)}
                  className={`py-3 min-h-[44px] ${mobileTextColor} flex items-center gap-2`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
                  Saved
                </Link>
                <Link
                  href="/saved-searches"
                  onClick={() => setMobileOpen(false)}
                  className={`py-3 min-h-[44px] ${mobileTextColor} flex items-center gap-2`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  Searches
                </Link>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
                {isLoggedIn && (
                  <Link
                    href={authHref}
                    onClick={() => setMobileOpen(false)}
                    className="block w-full btn-liquid bg-brand-gold text-white font-medium py-4 rounded-full text-sm text-center"
                  >
                    {authLabel}
                  </Link>
                )}
                {!isLoggedIn && (
                  <Link
                    href="/sign-in"
                    onClick={() => setMobileOpen(false)}
                    className="block w-full btn-liquid bg-white text-brand-dark font-medium py-4 rounded-full text-sm text-center"
                  >
                    Sign In
                  </Link>
                )}
                {/* Always show Sign Out — if not logged in it just clears any stale cookie */}
                <button
                  onClick={async () => {
                    await auth.logout();
                    setMobileOpen(false);
                    router.push('/sign-in');
                  }}
                  className="block w-full border border-white/20 text-white font-medium py-4 rounded-full text-sm text-center active:bg-white/10"
                >
                  Sign Out
                </button>
                <p className="text-center text-sm font-light text-white/30 mt-5">(646) 258-4460</p>
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
