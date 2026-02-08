'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Section {
  title: string;
  content: string;
}

interface CTA {
  title: string;
  description: string;
  buttonText: string;
  buttonLink: string;
}

interface ResourceData {
  slug: string;
  title: string;
  subtitle: string;
  heroImage: string;
  sections: Section[];
  cta: CTA;
}

function renderMarkdown(content: string): string {
  return content
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-8 mb-3">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Lists
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    // Paragraphs
    .split('\n\n')
    .map(block => {
      if (block.startsWith('<') || block.trim() === '') return block;
      if (block.includes('<li')) return `<ul class="list-disc list-inside space-y-1 my-3">${block}</ul>`;
      return `<p class="my-3">${block}</p>`;
    })
    .join('\n');
}

export default function ResourceContent({ slug }: { slug: string }) {
  const [data, setData] = useState<ResourceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/resources/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="py-16">
        <div className="max-w-3xl mx-auto px-4">
          <div className="animate-pulse">
            <div className="h-10 bg-gray-200 rounded w-2/3 mb-4"></div>
            <div className="h-6 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-2">
                  <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-16 text-center">
        <div className="max-w-xl mx-auto px-4">
          <h1 className="text-3xl font-semibold mb-4">Resource Not Found</h1>
          <p className="text-gray-600 mb-8">
            The resource you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-brand-dark text-white rounded hover:bg-gray-800"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Hero Section */}
      <section className="relative h-[40vh] min-h-[300px] flex items-center justify-center">
        <div className="absolute inset-0">
          <Image
            src={data.heroImage}
            alt={data.title}
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-black/50" />
        </div>
        <div className="relative z-10 text-center text-white px-4 max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-semibold mb-4">{data.title}</h1>
          <p className="text-lg md:text-xl text-gray-200">{data.subtitle}</p>
        </div>
      </section>

      {/* Table of Contents */}
      <section className="py-8 bg-white border-b">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
            In This Guide
          </h2>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {data.sections.map((section, index) => (
              <a
                key={index}
                href={`#section-${index}`}
                className="text-brand-dark hover:text-brand-gold transition-colors"
              >
                {section.title}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* Content Sections */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4">
          {data.sections.map((section, index) => (
            <div key={index} id={`section-${index}`} className="mb-12 scroll-mt-24">
              <h2 className="text-2xl font-semibold mb-4 pb-2 border-b">
                {section.title}
              </h2>
              <div
                className="text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      {data.cta && (
        <section className="py-16 bg-brand-dark text-white">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <h2 className="text-2xl md:text-3xl font-semibold mb-4">
              {data.cta.title}
            </h2>
            <p className="text-gray-300 mb-8">
              {data.cta.description}
            </p>
            <Link
              href={data.cta.buttonLink}
              className="inline-block px-8 py-3 bg-white text-brand-dark font-medium rounded hover:bg-gray-100 transition-colors"
            >
              {data.cta.buttonText}
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
