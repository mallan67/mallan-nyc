'use client';

import { useEffect, useState } from 'react';
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

/** Guides that require email capture before showing full content */
const GATED_SLUGS = ['buyers-guide', 'sellers-guide'];

function guideTypeFromSlug(slug: string): 'buyer' | 'seller' {
  return slug === 'sellers-guide' ? 'seller' : 'buyer';
}

/* ---- What's Inside bullet data ---- */
const WHATS_INSIDE: Record<string, string[]> = {
  'buyers-guide': [
    'Understanding Co-ops vs Condos',
    'The Buying Process Step by Step',
    'Financing and Pre-Approval',
    'Board Package Preparation',
    'Closing Costs Breakdown',
    'Neighborhood Selection Guide',
  ],
  'sellers-guide': [
    'Preparing Your Home for Market',
    'Pricing Strategy',
    'Marketing Your Property',
    'Open Houses and Showings',
    'Offers and Negotiation',
    'The Closing Process',
    'Understanding Your Net Proceeds',
  ],
};

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-[#C4A052] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

/* ---- Email Gate Form ---- */
function EmailGateForm({
  slug,
  onUnlocked,
}: {
  slug: string;
  onUnlocked: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const guideType = guideTypeFromSlug(slug);
  const bullets = WHATS_INSIDE[slug] || [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    if (!agreed) {
      setError('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/guides/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim(),
          guideType,
          agreeToTerms: agreed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      onUnlocked();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="py-16 md:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
          {/* Left — What's Inside */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#C4A052] mb-3">
              Free Download
            </p>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-brand-dark mb-6">
              What&apos;s Inside
            </h2>
            <ul className="space-y-4 mb-8">
              {bullets.map((item) => (
                <li key={item} className="flex items-start gap-3 text-brand-dark/90">
                  <CheckIcon />
                  <span className="text-[15px] leading-snug">{item}</span>
                </li>
              ))}
            </ul>

            {/* Trust indicators */}
            <div className="flex flex-wrap gap-6 text-brand-dark/60 text-xs">
              <span className="flex items-center gap-1.5">
                <ShieldIcon />
                Licensed Broker
              </span>
              <span className="flex items-center gap-1.5">
                <DownloadIcon />
                Free Download
              </span>
              <span className="flex items-center gap-1.5">
                <BookIcon />
                No Obligation
              </span>
            </div>
          </div>

          {/* Right — Form */}
          <div className="bg-gray-50 rounded-2xl p-6 sm:p-8 border border-black/5">
            <h3 className="font-display text-lg font-semibold text-brand-dark mb-1">
              Get Your Free Guide
            </h3>
            <p className="text-sm text-brand-dark/70 mb-6">
              Enter your email to access the full guide instantly.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="gate-name" className="block text-xs font-semibold text-gray-700 mb-1">
                  Name <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="gate-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-4 py-2.5 text-sm border border-black/10 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#C4A052]/40 focus:border-[#C4A052] transition-all"
                  autoComplete="name"
                />
              </div>
              <div>
                <label htmlFor="gate-email" className="block text-xs font-semibold text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="gate-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 text-sm border border-black/10 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#C4A052]/40 focus:border-[#C4A052] transition-all"
                  autoComplete="email"
                />
              </div>

              {/* TCPA consent */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-[#C4A052] focus:ring-[#C4A052]"
                />
                <span className="text-[11px] text-brand-dark/60 leading-relaxed">
                  I agree to the{' '}
                  <Link href="/terms" className="underline hover:text-brand-dark">Terms of Service</Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="underline hover:text-brand-dark">Privacy Policy</Link>.
                  By submitting, I consent to receive communications from Mallan Real Estate.
                  I can unsubscribe at any time.
                </span>
              </label>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-[#C4A052] text-white font-semibold text-sm rounded-xl hover:bg-[#B8960B] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
              >
                {submitting ? 'Processing...' : 'Download Free Guide'}
              </button>
            </form>

            <p className="text-[10px] text-brand-dark/40 mt-4 text-center">
              Mallan Real Estate Inc. &middot; License #10991205323
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---- Main Component ---- */
export default function ResourceContent({ slug }: { slug: string }) {
  const [data, setData] = useState<ResourceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // SSR-safe: server renders locked. The mount effect below checks
  // localStorage for a previous unlock OR auto-unlocks for non-gated
  // slugs. Canonical "client-only state from a browser API" pattern.
  const [unlocked, setUnlocked] = useState(false);

  const isGated = GATED_SLUGS.includes(slug);

  // Check localStorage for previous unlock
  useEffect(() => {
    if (isGated) {
      try {
        const key = `guide_unlocked_${slug}`;
        if (localStorage.getItem(key) === 'true') {
          setUnlocked(true);
        }
      } catch {
        // localStorage unavailable
      }
    } else {
      setUnlocked(true);
    }
  }, [slug, isGated]);

  useEffect(() => {
    fetch(`/api/resources/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [slug]);

  function handleUnlock() {
    setUnlocked(true);
    try {
      localStorage.setItem(`guide_unlocked_${slug}`, 'true');
    } catch {
      // localStorage unavailable
    }
  }

  if (loading) {
    return (
      <div className="py-16">
        <div className="max-w-3xl mx-auto px-4">
          <div className="animate-pulse">
            <div className="h-10 bg-black/5 rounded w-2/3 mb-4"></div>
            <div className="h-6 bg-black/5 rounded w-1/2 mb-8"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-2">
                  <div className="h-6 bg-black/5 rounded w-1/3"></div>
                  <div className="h-4 bg-black/5 rounded"></div>
                  <div className="h-4 bg-black/5 rounded w-5/6"></div>
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
          <h1 className="text-2xl font-display font-semibold mb-4">Resource Not Found</h1>
          <p className="text-brand-dark/90 mb-8">
            The resource you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  // Determine hero title override for gated guides
  const heroTitle = isGated && !unlocked
    ? (slug === 'buyers-guide' ? 'The Complete Guide to Buying in NYC' : 'Your Guide to Selling in NYC')
    : data.title;

  const heroSubtitle = isGated && !unlocked
    ? (slug === 'buyers-guide'
      ? 'Everything you need to know about purchasing property in New York City'
      : 'Maximize your property value with expert selling strategies')
    : data.subtitle;

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
          <div className="absolute inset-0 hero-gradient" />
        </div>
        <div className="relative z-10 text-center text-white px-4 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C4A052] mb-3">
            Mallan Real Estate
          </p>
          <h1 className="font-display font-bold text-3xl md:text-5xl mb-4">{heroTitle}</h1>
          <p className="text-lg md:text-xl text-gray-200">{heroSubtitle}</p>
        </div>
      </section>

      {/* Gated: show email form + preview */}
      {isGated && !unlocked && (
        <>
          <EmailGateForm slug={slug} onUnlocked={handleUnlock} />

          {/* Preview — show first section only with fade-out */}
          <section className="pb-4">
            <div className="max-w-3xl mx-auto px-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#C4A052] mb-4">
                Preview
              </p>
              <div className="relative">
                <div className="mb-8">
                  <h2 className="text-xl font-display font-semibold mb-4 pb-2 border-b border-black/5">
                    {data.sections[0].title}
                  </h2>
                  <div
                    className="text-brand-dark/95 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(data.sections[0].content) }}
                  />
                </div>
                {/* Fade-out overlay */}
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none" />
              </div>

              <div className="text-center py-8">
                <p className="text-brand-dark/60 text-sm mb-2">
                  Enter your email above to read the complete guide.
                </p>
                <p className="text-brand-dark/40 text-xs">
                  {data.sections.length} sections &middot; Free &middot; No obligation
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Full content (unlocked or non-gated) */}
      {unlocked && (
        <>
          {/* Table of Contents */}
          <section className="py-8 bg-gray-50/50 border-b border-black/5">
            <div className="max-w-3xl mx-auto px-4">
              <h2 className="text-sm font-medium text-brand-dark/85 uppercase tracking-wide mb-3">
                In This Guide
              </h2>
              <nav className="flex flex-wrap gap-x-6 gap-y-2">
                {data.sections.map((section, index) => (
                  <a
                    key={index}
                    href={`#section-${index}`}
                    className="text-brand-dark hover:text-[#C4A052] transition-colors"
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
                  <h2 className="text-xl font-display font-semibold mb-4 pb-2 border-b border-black/5">
                    {section.title}
                  </h2>
                  <div
                    className="text-brand-dark/95 leading-relaxed"
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
                <h2 className="text-xl md:text-2xl font-display font-semibold mb-4">
                  {data.cta.title}
                </h2>
                <p className="text-gray-300 mb-8">
                  {data.cta.description}
                </p>
                <Link
                  href={data.cta.buttonLink}
                  className="inline-block px-8 py-3 bg-white text-brand-dark font-medium rounded-2xl hover:bg-white/90 transition-colors"
                >
                  {data.cta.buttonText}
                </Link>
              </div>
            </section>
          )}

          {/* Print-friendly notice */}
          <section className="py-8 border-t border-black/5">
            <div className="max-w-3xl mx-auto px-4 text-center">
              <p className="text-xs text-brand-dark/50">
                You can save this guide by using your browser&apos;s Print function (Ctrl+P / Cmd+P) and selecting &quot;Save as PDF&quot;.
              </p>
            </div>
          </section>
        </>
      )}
    </>
  );
}
