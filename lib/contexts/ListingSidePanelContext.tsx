'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Listing } from '@/lib/types/listing';

type SidePanelContextValue = {
  activeListing: Listing | null;
  isOpen: boolean;
  openListing: (listing: Listing) => void;
  closeListing: () => void;
};

const SidePanelContext = createContext<SidePanelContextValue | null>(null);

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [activeListing, setActiveListing] = useState<Listing | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openListing = useCallback((listing: Listing) => {
    setActiveListing(listing);
    setIsOpen(true);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeListing = useCallback(() => {
    setIsOpen(false);
    document.body.style.overflow = '';
    // Delay clearing listing data so close animation can complete
    setTimeout(() => setActiveListing(null), 750);
  }, []);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) closeListing();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeListing]);

  return (
    <SidePanelContext.Provider value={{ activeListing, isOpen, openListing, closeListing }}>
      {children}
    </SidePanelContext.Provider>
  );
}

export function useSidePanel() {
  const ctx = useContext(SidePanelContext);
  if (!ctx) throw new Error('useSidePanel must be used within SidePanelProvider');
  return ctx;
}
