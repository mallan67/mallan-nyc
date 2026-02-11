'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type ResourceItem = { title: string; href: string };

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

function NavDropdown({ label, items }: { label: string; items: { title: string; href: string }[] }) {
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

  return (
    <div ref={ref} className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex items-center gap-1 whitespace-nowrap text-white/90 hover:text-white hover:underline decoration-white/40 underline-offset-8 transition-colors"
      >
        {label}
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-xl shadow-2xl ring-1 ring-black/5 min-w-[180px] z-50 overflow-hidden py-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors font-normal"
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

  // When dark mode (inner pages), use fixed positioning so header stays at top while scrolling
  // When not dark (homepage), use absolute so it overlays the hero
  const positionClass = dark ? 'fixed' : 'absolute';
  // Glass effect background for dark mode / mobile menu
  const bgClass = mobileOpen || dark ? 'bg-black/80 backdrop-blur-md' : '';

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
      className="block py-3 min-h-[44px] text-base text-white/70 active:text-white cursor-pointer select-none"
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

  return (
    <header className={`${positionClass} top-0 left-0 right-0 z-50 transition-all duration-300 ${bgClass}`}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Brand */}
          <Link
            href="/"
            className="text-white text-xl sm:text-2xl lg:text-[1.75rem] font-semibold tracking-tight hover:text-white/80 transition-colors whitespace-nowrap"
          >
            Mallan Real Estate Inc.
          </Link>

          {/* Desktop Nav */}
          <nav
            className="hidden lg:flex items-center ml-auto pl-8 xl:pl-12"
            aria-label="Main navigation"
          >
            <ul className="flex items-center gap-3 lg:gap-4 xl:gap-5 2xl:gap-6 text-[13px] lg:text-[14px] xl:text-[15px] 2xl:text-base font-bold text-white/90">
              <li><NavDropdown label="Buy" items={buyItems} /></li>
              <li><NavDropdown label="Rent" items={rentItems} /></li>
              <li><NavDropdown label="Sell" items={sellItems} /></li>
              <li><NavDropdown label="Exclusives" items={exclusivesItems} /></li>
              <li><NavDropdown label="Neighborhoods" items={neighborhoodItems} /></li>

              <li>
                <Link href="/open-houses" className="inline-flex items-center whitespace-nowrap hover:text-white hover:underline decoration-white/40 underline-offset-8 transition-colors">
                  Open Houses
                </Link>
              </li>

              <li><NavDropdown label="Resources" items={resources} /></li>

              <li>
                <Link href="/agents" className="inline-flex items-center whitespace-nowrap hover:text-white hover:underline decoration-white/40 underline-offset-8 transition-colors">
                  Agents
                </Link>
              </li>

              <li>
                <Link href="/about" className="inline-flex items-center whitespace-nowrap hover:text-white hover:underline decoration-white/40 underline-offset-8 transition-colors">
                  About
                </Link>
              </li>

              <li>
                <Link href="/sign-in" className="inline-flex items-center whitespace-nowrap hover:text-white hover:underline decoration-white/40 underline-offset-8 transition-colors">
                  Sign Up / Sign In
                </Link>
              </li>
            </ul>
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
          <nav id="mobile-nav" className="lg:hidden py-6 text-white text-lg font-bold max-h-[calc(100vh-5rem)] overflow-y-auto" aria-label="Mobile navigation">
            <div className="flex flex-col gap-1">
              {/* Buy */}
              <div>
                <button
                  type="button"
                  onClick={() => setBuyOpen(!buyOpen)}
                  className="flex items-center gap-2 text-white/90 hover:text-white w-full py-3 min-h-[44px]"
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
                  className="flex items-center gap-2 text-white/90 hover:text-white w-full py-3 min-h-[44px]"
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
                  className="flex items-center gap-2 text-white/90 hover:text-white w-full py-3 min-h-[44px]"
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
                  className="flex items-center gap-2 text-white/90 hover:text-white w-full py-3 min-h-[44px]"
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
                  className="flex items-center gap-2 text-white/90 hover:text-white w-full py-3 min-h-[44px]"
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
                className="py-3 min-h-[44px] text-white/90 hover:text-white"
              >
                Open Houses
              </Link>

              <div>
                <button
                  type="button"
                  onClick={() => setResourcesOpen(!resourcesOpen)}
                  className="flex items-center gap-2 text-white/90 hover:text-white w-full py-3 min-h-[44px]"
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
                className="py-3 min-h-[44px] text-white/90 hover:text-white"
              >
                Agents
              </Link>

              <Link
                href="/about"
                onClick={() => setMobileOpen(false)}
                className="py-3 min-h-[44px] text-white/90 hover:text-white"
              >
                About
              </Link>

              <Link
                href="/sign-in"
                onClick={() => setMobileOpen(false)}
                className="py-3 min-h-[44px] text-white/90 hover:text-white"
              >
                Sign Up / Sign In
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
