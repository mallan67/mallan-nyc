'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';

interface AboutData {
  title: string;
  heroImage: string;
  mission: {
    title: string;
    content: string;
  };
  story: {
    title: string;
    content: string;
  };
  values: Array<{
    title: string;
    description: string;
  }>;
}

export default function AboutContent() {
  const [data, setData] = useState<AboutData | null>(null);
  const [loading, setLoading] = useState(true);
  const valuesRef = useGsapReveal<HTMLDivElement>({ children: true, y: 50, scale: 0.97 });

  useEffect(() => {
    fetch('/api/pages/about-us')
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="animate-pulse">
            <div className="h-10 bg-gray-200 rounded w-1/3 mx-auto mb-8"></div>
            <div className="h-64 bg-gray-200 rounded-2xl mb-8"></div>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-16 text-center">
        <p className="text-brand-dark/60">Unable to load content.</p>
      </div>
    );
  }

  return (
    <>
      {/* Hero Section */}
      <section className="relative h-[60vh] min-h-[500px] flex items-center justify-center">
        <div className="absolute inset-0">
          <Image
            src={data.heroImage}
            alt="About Mallan Real Estate"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 hero-gradient" />
        </div>
        <div className="relative z-10 text-center text-white px-4">
          <h1 className="font-display font-bold text-3xl md:text-5xl mb-4">{data.title}</h1>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-xl md:text-2xl font-display font-semibold mb-6">{data.mission.title}</h2>
          <p className="text-lg text-brand-dark/70 leading-relaxed">{data.mission.content}</p>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-xl md:text-2xl font-display font-semibold mb-6 text-center">{data.story.title}</h2>
          <div className="text-brand-dark/70 leading-relaxed space-y-4">
            {data.story.content.split('\n\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-xl md:text-2xl font-display font-semibold mb-10 text-center">Our Values</h2>
          <div ref={valuesRef} className="grid md:grid-cols-2 gap-8">
            {data.values.map((value, index) => (
              <div key={index} className="glass-card rounded-3xl p-8">
                <h3 className="text-xl font-display font-semibold mb-3 text-brand-dark">
                  {value.title}
                </h3>
                <p className="text-brand-dark/60 leading-relaxed">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-brand-dark text-white">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-xl md:text-2xl font-display font-semibold mb-4">
            Ready to Work with Us?
          </h2>
          <p className="text-gray-300 mb-8">
            Connect with our team of experienced agents and start your real estate journey today.
          </p>
          <Link
            href="/agents"
            className="inline-block px-8 py-3 bg-white text-brand-dark font-medium rounded-full hover:bg-gray-100 transition-colors"
          >
            Meet Our Team
          </Link>
        </div>
      </section>
    </>
  );
}
