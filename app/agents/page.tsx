import { Metadata } from 'next';
import SocialShareBar from '@/app/components/SocialShareBar';
import AgentsGrid from '@/app/components/AgentsGrid';
import prisma from '@/lib/prisma';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Our Agents | Mallan Real Estate',
  description: 'Meet our team of experienced real estate professionals serving New York City.',
  alternates: { canonical: 'https://mallan.nyc/agents' },
  openGraph: {
    title: 'Our Agents | Mallan Real Estate',
    description: 'Meet our team of licensed, experienced real estate professionals serving buyers, sellers, and renters across NYC.',
    url: 'https://mallan.nyc/agents',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Our Agents | Mallan Real Estate',
    description: 'Meet our team of licensed, experienced real estate professionals serving buyers, sellers, and renters across NYC.',
  },
};

async function getAgents() {
  try {
    const agents = await prisma.agent.findMany({
      where: { status: 'active' },
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
      orderBy: [{ featured: 'desc' }, { created_at: 'asc' }],
    });

    return agents.map((a) => ({
      id: a.public_slug || `${a.first_name}-${a.last_name}`.toLowerCase().replace(/\s+/g, '-'),
      name: a.full_name || `${a.first_name} ${a.last_name}`,
      title: a.title || 'Licensed Real Estate Salesperson',
      photo: a.photo || '/images/agent-placeholder.svg',
      phone: a.phone || '',
      email: a.email,
      bio: a.bio || '',
      specialties: a.specialties,
      languages: a.languages,
      featured: a.featured,
    }));
  } catch {
    // Fallback to static JSON if DB fails
    const agentsData = await import('@/data/agents.json');
    return agentsData.agents || [];
  }
}

export default async function AgentsPage() {
  const agents = await getAgents();

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-20">
        <AgentsGrid initialAgents={agents} />
      </main>
      <SocialShareBar title="Our Agents | Mallan Real Estate" />
    </div>
  );
}
