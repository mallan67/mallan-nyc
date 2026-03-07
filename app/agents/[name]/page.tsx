import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import prisma from '@/lib/prisma';
import agentsJson from '@/data/agents.json';

type Props = {
  params: Promise<{ name: string }>;
};

interface AgentProfile {
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

async function getAgentBySlug(slug: string): Promise<AgentProfile | null> {
  const nameFromSlug = slug.replace(/-/g, ' ');

  try {
    const agent = await prisma.agent.findFirst({
      where: {
        OR: [
          { public_slug: slug },
          { full_name: { equals: nameFromSlug, mode: 'insensitive' } },
        ],
        status: 'active',
      },
      select: {
        public_slug: true,
        full_name: true,
        first_name: true,
        last_name: true,
        title: true,
        photo: true,
        phone: true,
        email: true,
        bio: true,
        specialties: true,
        languages: true,
        featured: true,
      },
    });
    if (agent) {
      return {
        id: agent.public_slug || slug,
        name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
        title: agent.title || 'Licensed Real Estate Salesperson',
        photo: agent.photo || '/images/agent-placeholder.svg',
        phone: agent.phone || '',
        email: agent.email,
        bio: agent.bio || '',
        specialties: agent.specialties,
        languages: agent.languages,
        featured: agent.featured,
      };
    }
  } catch {
    // DB unavailable — fall through to static JSON
  }

  const staticAgent = agentsJson.agents.find(
    (a) => a.id === slug || a.name.toLowerCase().replace(/\s+/g, '-') === slug
  );
  return staticAgent || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const agent = await getAgentBySlug(name);
  if (!agent) return { title: 'Agent Not Found | Mallan Real Estate' };
  return {
    title: `${agent.name} | ${agent.title} | Mallan Real Estate`,
    description: `${agent.name}, ${agent.title} at Mallan Real Estate. ${agent.bio.substring(0, 155)}...`,
  };
}

export default async function AgentPage({ params }: Props) {
  const { name } = await params;
  const agent = await getAgentBySlug(name);

  if (!agent) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <Header dark />
      <main className="pt-20">
        {/* Agent Profile Header */}
        <section className="border-b border-black/5">
          <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
            <Link
              href="/agents"
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-brand-dark/85 hover:text-brand-gold transition-colors mb-6"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              All Agents
            </Link>

            <div className="flex flex-col md:flex-row gap-6 lg:gap-10">
              {/* Agent Photo — face-focused portrait + CTA below */}
              <div className="flex-shrink-0 mx-auto md:mx-0 flex flex-col items-center">
                <div className="relative w-64 h-80 sm:w-72 sm:h-96 overflow-hidden rounded-2xl bg-gray-100">
                  <Image
                    src={agent.photo || '/images/agent-placeholder.svg'}
                    alt={agent.name}
                    fill
                    className="object-cover object-[center_15%]"
                    priority
                  />
                </div>
                <Link
                  href={`/agents/${name}/listings`}
                  className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 bg-brand-dark text-white text-sm font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors w-full justify-center"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  View Active Listings
                </Link>
              </div>

              {/* Agent Info */}
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                  <h1 className="text-xl sm:text-2xl font-light tracking-wide text-brand-dark">
                    {agent.name}<span className="text-brand-dark/75">,</span>{' '}
                    <span className="text-base sm:text-lg text-brand-dark/85">{agent.title}</span>
                  </h1>
                </div>

                {/* Contact */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-5">
                  <a
                    href={`tel:${agent.phone.replace(/[^0-9]/g, '')}`}
                    className="inline-flex items-center gap-2 text-sm text-brand-dark hover:text-brand-gold transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {agent.phone}
                  </a>
                  <span className="text-brand-dark/20 hidden sm:inline">|</span>
                  <a
                    href={`mailto:${agent.email}`}
                    className="inline-flex items-center gap-2 text-sm text-brand-dark hover:text-brand-gold transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {agent.email}
                  </a>
                </div>

                {/* Short Bio — first paragraph only */}
                <div className="text-sm text-brand-dark/90 leading-relaxed max-w-2xl mb-5">
                  {agent.bio.split('\n\n')[0]}
                </div>

                {/* Specialties & Languages */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  {agent.specialties.map((specialty, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 ring-1 ring-black/5 text-xs text-brand-dark/90 rounded-full"
                    >
                      {specialty}
                    </span>
                  ))}
                  {agent.languages.length > 1 && (
                    <span className="px-2.5 py-1 ring-1 ring-black/5 text-xs text-brand-dark/90 rounded-full">
                      {agent.languages.join(' · ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="py-12 bg-brand-dark">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-xl sm:text-2xl font-display font-semibold text-white mb-3">
              Work with {agent.name}
            </h2>
            <p className="text-gray-300 text-sm mb-6">
              Ready to buy, sell, or rent? Get in touch today.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={`tel:${agent.phone.replace(/[^0-9]/g, '')}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-white text-brand-dark text-sm font-medium rounded-2xl hover:bg-white/90 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {agent.phone}
              </a>
              <a
                href={`mailto:${agent.email}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 border border-white/30 text-white text-sm font-medium rounded-2xl hover:bg-white/10 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
