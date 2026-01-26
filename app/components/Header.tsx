'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
        className="flex items-center gap-1 whitespace-nowrap text-white/90 hover:text-white hover:underline decoration-white/40 underline-offset-8 transition-colors"
      >
        {label}
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-3 bg-white rounded-xl shadow-2xl ring-1 ring-black/5 min-w-[180px] z-50 overflow-hidden">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onToggle}
              className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [rentOpen, setRentOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
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

  return (
    <header className={`absolute top-0 left-0 right-0 z-40 ${mobileOpen ? 'bg-black/95' : ''}`}>
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
            className="hidden lg:flex items-center gap-4 xl:gap-6 text-[15px] xl:text-base font-bold text-white/90 ml-auto"
            aria-label="Main navigation"
          >
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

            <Link href="/search?type=commercial" className="whitespace-nowrap hover:text-white hover:underline decoration-white/40 underline-offset-8 transition-colors">
              Commercial
            </Link>

            <Link href="/open-houses" className="whitespace-nowrap hover:text-white hover:underline decoration-white/40 underline-offset-8 transition-colors">
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

            <Link href="/agents" className="whitespace-nowrap hover:text-white hover:underline decoration-white/40 underline-offset-8 transition-colors">
              Agents
            </Link>

            <Link href="/about" className="whitespace-nowrap hover:text-white hover:underline decoration-white/40 underline-offset-8 transition-colors">
              About
            </Link>

            <button className="hover:text-white transition-colors" aria-label="Search">
              <SearchIcon />
            </button>

            <Link href="/sign-in" className="whitespace-nowrap hover:text-white hover:underline decoration-white/40 underline-offset-8 transition-colors">
              Sign In
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
          <nav id="mobile-nav" className="lg:hidden py-6 text-white text-lg font-bold" aria-label="Mobile navigation">
            <div className="flex flex-col gap-1">
              {/* Buy */}
              <div>
                <button
                  onClick={() => setBuyOpen(!buyOpen)}
                  className="flex items-center gap-2 text-white/90 hover:text-white w-full py-3 min-h-[44px]"
                >
                  Buy
                  <svg className={`w-3 h-3 transition-transform ${buyOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {buyOpen && (
                  <div className="pl-4 pb-2 flex flex-col">
                    {buyItems.map((item) => (
                      <button
                        key={item.href}
                        onClick={() => {
                          router.push(item.href);
                          setMobileOpen(false);
                        }}
                        className="block py-3 min-h-[44px] text-base text-white/70 hover:text-white active:text-white text-left"
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Rent */}
              <div>
                <button
                  onClick={() => setRentOpen(!rentOpen)}
                  className="flex items-center gap-2 text-white/90 hover:text-white w-full py-3 min-h-[44px]"
                >
                  Rent
                  <svg className={`w-3 h-3 transition-transform ${rentOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {rentOpen && (
                  <div className="pl-4 pb-2 flex flex-col">
                    {rentItems.map((item) => (
                      <button
                        key={item.href}
                        onClick={() => {
                          router.push(item.href);
                          setMobileOpen(false);
                        }}
                        className="block py-3 min-h-[44px] text-base text-white/70 hover:text-white active:text-white text-left"
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sell */}
              <div>
                <button
                  onClick={() => setSellOpen(!sellOpen)}
                  className="flex items-center gap-2 text-white/90 hover:text-white w-full py-3 min-h-[44px]"
                >
                  Sell
                  <svg className={`w-3 h-3 transition-transform ${sellOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {sellOpen && (
                  <div className="pl-4 pb-2 flex flex-col">
                    {sellItems.map((item) => (
                      <button
                        key={item.href}
                        onClick={() => {
                          router.push(item.href);
                          setMobileOpen(false);
                        }}
                        className="block py-3 min-h-[44px] text-base text-white/70 hover:text-white active:text-white text-left"
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Link
                href="/search?type=commercial"
                onClick={() => setMobileOpen(false)}
                className="py-3 min-h-[44px] text-white/90 hover:text-white"
              >
                Commercial
              </Link>

              <Link
                href="/open-houses"
                onClick={() => setMobileOpen(false)}
                className="py-3 min-h-[44px] text-white/90 hover:text-white"
              >
                Open Houses
              </Link>

              <div>
                <button
                  onClick={() => setResourcesOpen(!resourcesOpen)}
                  className="flex items-center gap-2 text-white/90 hover:text-white w-full py-3 min-h-[44px]"
                >
                  Resources
                  <svg className={`w-3 h-3 transition-transform ${resourcesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {resourcesOpen && (
                  <div className="pl-4 pb-2 flex flex-col">
                    {resources.map((item) => (
                      <button
                        key={item.href}
                        onClick={() => {
                          router.push(item.href);
                          setMobileOpen(false);
                        }}
                        className="block py-3 min-h-[44px] text-base text-white/70 hover:text-white active:text-white text-left"
                      >
                        {item.title}
                      </button>
                    ))}
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
                Sign In
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
