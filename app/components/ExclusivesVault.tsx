'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';

export default function ExclusivesVault() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const sectionRef = useGsapReveal<HTMLDivElement>({ y: 40 });

  // Check if user is already signed in via cookie
  useEffect(() => {
    const hasAuth = document.cookie.includes('pc_auth=');
    if (hasAuth) setIsUnlocked(true);
  }, []);

  const _handleUnlock = () => {
    // In production, this would open the sign-in flow
    // For now, simulate unlock
    setIsUnlocked(true);
  };

  return (
    <section className="relative bg-brand-dark py-24 md:py-36 lg:py-44 overflow-hidden">
      {/* Background image — blurred */}
      <div className="absolute inset-0 opacity-15">
        <Image
          src="https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1600&q=80&auto=format&fit=crop"
          alt=""
          fill
          className="object-cover blur-lg"
          sizes="100vw"
          loading="lazy"
          aria-hidden="true"
        />
      </div>

      {!isUnlocked ? (
        /* Locked state — small translucent glass card */
        <div ref={sectionRef} className="relative z-10 max-w-xl mx-auto text-center px-6">
          <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[32px] p-12 md:p-16 gold-pulse">
            <div
              className="w-16 h-16 rounded-full bg-white/[0.08] flex items-center justify-center mx-auto mb-8"
              style={{ boxShadow: '0 0 40px rgba(184,134,11,0.1)' }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-brand-gold-deep">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h2 className="font-display font-bold text-white text-2xl md:text-3xl lg:text-4xl mb-4">Private Collection</h2>
            <p className="text-white/60 text-sm font-light leading-relaxed mb-10 max-w-sm mx-auto">
              Pre-launch opportunities and pocket listings for registered clients only.
            </p>
            <div className="flex justify-center gap-10 md:gap-14 mb-10">
              <div>
                <p className="font-display font-bold text-white text-2xl">12</p>
                <p className="text-white/50 text-[11px] font-light mt-1">Listings</p>
              </div>
              <div>
                <p className="font-display font-bold text-white text-2xl">$2.1M</p>
                <p className="text-white/50 text-[11px] font-light mt-1">Average</p>
              </div>
              <div>
                <p className="font-display font-bold text-white text-2xl">48hr</p>
                <p className="text-white/50 text-[11px] font-light mt-1">To Offer</p>
              </div>
            </div>
            <Link
              href="/sign-in"
              className="btn-gold bg-brand-gold-deep text-white font-medium text-sm px-10 py-4 rounded-full inline-flex items-center gap-2.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Sign In to Unlock
            </Link>
          </div>
        </div>
      ) : (
        /* Unlocked state — no listings yet */
        <div className="relative z-10 px-6 md:px-12 lg:px-20 max-w-[1440px] mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-2 h-2 rounded-full bg-brand-gold-deep gold-pulse" />
            <span className="text-brand-gold-deep text-[13px] font-medium gold-glow-text">Private Collection</span>
          </div>
          <p className="text-white/60 text-sm font-light max-w-md mx-auto">
            No exclusive listings at this time. Check back soon for new opportunities.
          </p>
        </div>
      )}
    </section>
  );
}
