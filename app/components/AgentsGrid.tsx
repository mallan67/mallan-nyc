'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';

interface Agent {
  id: string;
  name: string;
  title: string;
  photo: string;
  phone: string;
  email: string;
  bio: string;
  specialties: string[];
  languages: string[];
  featured: boolean;
}

export default function AgentsGrid({ initialAgents }: { initialAgents?: Agent[] } = {}) {
  const [agents] = useState<Agent[]>(initialAgents || []);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [bioOverflows, setBioOverflows] = useState(false);
  const photoRef = useRef<HTMLDivElement>(null);
  const bioRef = useRef<HTMLDivElement>(null);
  const heroRef = useGsapReveal<HTMLDivElement>({ y: 40, duration: 1 });
  const featuredRef = useGsapReveal<HTMLDivElement>({ y: 50, duration: 1 });
  const teamRef = useGsapReveal<HTMLDivElement>({ children: true, y: 40, scale: 0.98, stagger: 0.12 });
  const loading = agents.length === 0;

  useEffect(() => {
    if (photoRef.current && bioRef.current) {
      const photoH = photoRef.current.offsetHeight;
      const bioH = bioRef.current.scrollHeight;
      setBioOverflows(bioH > photoH);
    }
  }, [agents]);

  if (loading) {
    return (
      <div className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="animate-pulse space-y-16">
            <div className="h-12 bg-black/5 rounded-2xl w-1/3 mx-auto" />
            <div className="grid lg:grid-cols-2 gap-12">
              <div className="aspect-[3/4] bg-black/5 rounded-3xl" />
              <div className="space-y-6">
                <div className="h-8 bg-black/5 rounded w-1/2" />
                <div className="h-4 bg-black/5 rounded w-1/3" />
                <div className="h-32 bg-black/5 rounded-2xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const featured = agents.find(a => a.featured && a.id === 'maya-allan') || agents.find(a => a.featured);
  const team = agents.filter(a => a.id !== featured?.id);

  return (
    <>
      {/* Cinematic Hero */}
      <section className="relative h-[50vh] min-h-[400px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&q=80&auto=format&fit=crop"
            alt="Manhattan skyline"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 hero-gradient" />
        </div>
        <div ref={heroRef} className="relative z-10 text-center text-white px-6">
          <p className="text-[13px] font-semibold mb-3 tracking-widest uppercase" style={{ color: '#D4AF37', textShadow: '0 0 20px rgba(212,175,55,0.5), 0 0 40px rgba(212,175,55,0.25)' }}>Mallan Real Estate</p>
          <h1 className="font-display font-bold text-3xl md:text-5xl lg:text-6xl tracking-tight mb-4">
            Our Agents
          </h1>
          <p className="text-white/60 text-sm md:text-base font-light max-w-lg mx-auto">
            Licensed professionals with deep market expertise across all five boroughs.
          </p>
        </div>
      </section>

      {/* Featured Agent — Editorial Split */}
      {featured && (
        <section className="py-14 md:py-20">
          <div className="max-w-[1200px] mx-auto px-6 md:px-12">
            <div ref={featuredRef} className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Portrait */}
              <div ref={photoRef} className="relative">
                <div className="relative aspect-[3/4] rounded-[32px] overflow-hidden float-shadow">
                  <Image
                    src={featured.photo}
                    alt={featured.name}
                    fill
                    className="object-cover object-[center_15%]"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    priority
                  />
                </div>
                {/* Gold accent bar */}
                <div
                  className="absolute -bottom-3 left-8 right-8 h-1 rounded-full"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(184,134,11,0.3), transparent)' }}
                />
              </div>

              {/* Bio */}
              <div ref={bioRef}>
                {/*
                  The eyebrow above this name was the literal string
                  "Principal Broker" — a regulated designation hard-coded into
                  the PUBLIC agent directory, asserted for whichever agent
                  happens to be `featured` and independent of the Agent record.
                  Directly beneath it, `{featured.title}` already renders the
                  designation DERIVED through the one title authority
                  (lib/agents/professional-title), so the card was publishing
                  two professional identities for the same person and only one
                  of them was governed. If the featured agent changes, or a
                  licence changes, the hard-coded one keeps its old claim —
                  a false statement about a licensee under NY DOS 19 NYCRR
                  175.25. Removed; the derived designation below is the only
                  one that may speak.
                */}
                <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-brand-dark mb-2">
                  {featured.name}
                </h2>
                <p className="text-brand-dark/90 text-sm font-light mb-8">{featured.title}</p>

                <div className="mb-8">
                  <div className={`text-brand-dark/90 text-[15px] font-light leading-[1.9] whitespace-pre-line overflow-hidden transition-all duration-500 ${!bioExpanded && bioOverflows ? 'max-h-[280px]' : 'max-h-[2000px]'}`}>
                    {featured.bio}
                  </div>
                  {!bioExpanded && bioOverflows && (
                    <div className="relative -mt-12 pt-12 bg-gradient-to-t from-[#FEFEFE] to-transparent" />
                  )}
                  {bioOverflows && (
                    <button
                      onClick={() => setBioExpanded(!bioExpanded)}
                      className="mt-2 text-brand-gold-deep text-[13px] font-medium hover:underline"
                    >
                      {bioExpanded ? 'Read less' : 'Read more'}
                    </button>
                  )}
                </div>

                {/* Specialties */}
                <div className="flex flex-wrap gap-2 mb-8">
                  {featured.specialties.map((s, i) => (
                    <span key={i} className="px-4 py-1.5 bg-brand-gold/8 text-brand-gold-deep text-[12px] font-medium rounded-full">
                      {s}
                    </span>
                  ))}
                </div>

                {/* Languages */}
                {featured.languages.length > 0 && (
                  <p className="text-brand-dark/90 text-[12px] font-light mb-8">
                    Languages: {featured.languages.join(', ')}
                  </p>
                )}

                {/* Contact + Profile Link */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href={`/agents/${featured.id}`}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-dark text-white text-sm font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors"
                  >
                    View Listings & Profile
                  </Link>
                  <a
                    href={`tel:${featured.phone.replace(/[^0-9+]/g, '')}`}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 ring-1 ring-black/10 text-brand-dark text-sm font-medium rounded-2xl hover:bg-black/[0.02] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    {featured.phone}
                  </a>
                  <a
                    href={`mailto:${featured.email}`}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 ring-1 ring-black/10 text-brand-dark text-sm font-medium rounded-2xl hover:bg-black/[0.02] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    {featured.email}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Divider */}
      <div className="max-w-[1200px] mx-auto px-6 md:px-12">
        <div className="border-t border-black/5" />
      </div>

      {/* Team Members — Horizontal Cards */}
      {team.length > 0 && (
        <section className="py-14 md:py-20">
          <div className="max-w-[1200px] mx-auto px-6 md:px-12">
            <div className="mb-10">
              <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">Meet</p>
              <h2 className="font-display font-bold text-2xl md:text-3xl tracking-tight text-brand-dark">The Team</h2>
            </div>

            <div ref={teamRef} className="space-y-10">
              {team.map((agent, idx) => (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.name.toLowerCase().replace(/\s+/g, '-')}`}
                  className={`group flex flex-col ${idx % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} gap-8 md:gap-12 items-center glass-card rounded-[32px] p-6 md:p-8 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] transition-all duration-500`}
                >
                  {/* Portrait */}
                  <div className="w-full md:w-72 flex-shrink-0">
                    <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-50">
                      <Image
                        src={agent.photo}
                        alt={agent.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-700"
                        sizes="(max-width: 768px) 100vw, 288px"
                      />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-bold text-xl md:text-2xl text-brand-dark mb-1">
                      {agent.name}
                    </h3>
                    <p className="text-brand-dark/90 text-sm font-light mb-4">{agent.title}</p>

                    <p className="text-brand-dark/90 text-[14px] font-light leading-[1.8] mb-5 line-clamp-3">
                      {agent.bio}
                    </p>

                    {/* Specialties */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {agent.specialties.slice(0, 4).map((s, i) => (
                        <span key={i} className="px-3 py-1 bg-brand-gold/8 text-brand-gold-deep text-[11px] font-medium rounded-full">
                          {s}
                        </span>
                      ))}
                    </div>

                    {/* Contact row */}
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-brand-dark/85 font-light">{agent.phone}</span>
                      <span className="text-brand-dark/20">|</span>
                      <span className="text-brand-dark/85 font-light">{agent.email}</span>
                    </div>

                    {agent.languages.length > 0 && (
                      <p className="text-brand-dark/85 text-[11px] font-light mt-2">
                        Languages: {agent.languages.join(', ')}
                      </p>
                    )}

                    <div className="mt-5">
                      <span className="text-[13px] text-brand-gold-deep font-medium group-hover:underline">
                        View Full Profile &rarr;
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 bg-brand-dark text-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-xl md:text-2xl font-display font-semibold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-gray-400 font-light mb-8">
            Contact any of our agents directly or reach out to our office.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="tel:+16462584460"
              className="inline-block px-8 py-3 bg-white text-brand-dark font-medium rounded-full hover:bg-white/90 transition-colors"
            >
              Call (646) 258-4460
            </a>
            <Link
              href="/contact"
              className="inline-block px-8 py-3 border border-white/20 text-white font-medium rounded-full hover:bg-white/10 transition-colors"
            >
              Send a Message
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
