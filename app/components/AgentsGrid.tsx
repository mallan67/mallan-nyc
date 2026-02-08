'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

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

export default function AgentsGrid() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agents/public')
      .then(res => res.json())
      .then(data => {
        setAgents(data.agents || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="animate-pulse">
            <div className="h-10 bg-gray-200 rounded w-1/4 mx-auto mb-8"></div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-4">
                  <div className="aspect-[3/4] bg-gray-200 rounded"></div>
                  <div className="h-6 bg-gray-200 rounded w-2/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sort: featured agents first
  const sortedAgents = [...agents].sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return 0;
  });

  return (
    <>
      {/* Hero Section */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-semibold mb-4">Our Team</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Our experienced agents bring deep market knowledge and a client-first approach
            to every transaction. Meet the professionals ready to help you achieve your
            real estate goals.
          </p>
        </div>
      </section>

      {/* Agents Grid */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          {agents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No agents to display.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedAgents.map(agent => (
                <Link key={agent.id} href={`/agents/${agent.name.toLowerCase().replace(/\s+/g, '-')}`} className="group">
                  {/* Photo */}
                  <div className="relative aspect-square mb-4 overflow-hidden rounded-lg bg-gray-100">
                    <Image
                      src={agent.photo || '/images/agent-placeholder.svg'}
                      alt={agent.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                    {agent.featured && (
                      <span className="absolute top-3 left-3 px-3 py-1 bg-brand-gold text-white text-xs uppercase tracking-wide rounded">
                        Featured
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold">{agent.name}</h3>
                    <p className="text-gray-600 text-sm">{agent.title}</p>

                    {/* Contact */}
                    <div className="flex flex-col gap-1 text-sm">
                      <a
                        href={`tel:${agent.phone.replace(/[^0-9]/g, '')}`}
                        className="text-gray-600 hover:text-brand-gold transition-colors"
                      >
                        {agent.phone}
                      </a>
                      <a
                        href={`mailto:${agent.email}`}
                        className="text-gray-600 hover:text-brand-gold transition-colors"
                      >
                        {agent.email}
                      </a>
                    </div>

                    {/* Specialties */}
                    {agent.specialties && agent.specialties.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {agent.specialties.slice(0, 3).map((specialty, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                          >
                            {specialty}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Languages */}
                    {agent.languages && agent.languages.length > 0 && (
                      <p className="text-xs text-gray-500 pt-1">
                        Languages: {agent.languages.join(', ')}
                      </p>
                    )}

                    {/* View Profile Link */}
                    <div className="pt-3">
                      <span className="text-sm text-brand-gold group-hover:underline">
                        View Profile →
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-gray-600 mb-8">
            Contact any of our agents directly or reach out to our office for assistance.
          </p>
          <a
            href="tel:+16462584460"
            className="inline-block px-8 py-3 bg-brand-dark text-white font-medium rounded hover:bg-gray-800 transition-colors"
          >
            Call (646) 258-4460
          </a>
        </div>
      </section>
    </>
  );
}
