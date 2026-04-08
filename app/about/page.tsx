import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SocialShareBar from '@/app/components/SocialShareBar';
import aboutData from '@/data/pages/about-us.json';
import ValuesGrid from './ValuesGrid';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'About Us | Mallan Real Estate',
  description: 'Learn about Mallan Real Estate - our story, mission, and commitment to exceptional service in NYC real estate.',
  alternates: { canonical: 'https://mallan.nyc/about' },
  openGraph: {
    title: 'About Us | Mallan Real Estate',
    description: 'Learn about Mallan Real Estate Inc. — a full-service NYC brokerage committed to exceptional service in residential sales and rentals.',
    url: 'https://mallan.nyc/about',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Us | Mallan Real Estate',
    description: 'Learn about Mallan Real Estate Inc. — a full-service NYC brokerage committed to exceptional service in residential sales and rentals.',
  },
};

export default function AboutPage() {
  const data = aboutData;

  return (
    <div className="min-h-screen bg-white font-sans">
      <main className="pt-20">
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
            <p className="text-lg text-brand-dark/95 leading-relaxed">{data.mission.content}</p>
          </div>
        </section>

        {/* Story Section */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-4">
            <h2 className="text-xl md:text-2xl font-display font-semibold mb-6 text-center">{data.story.title}</h2>
            <div className="text-brand-dark/95 leading-relaxed space-y-4">
              {data.story.content.split('\n\n').map((paragraph: string, index: number) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
        </section>

        {/* Values Section — client component for GSAP animation */}
        <ValuesGrid values={data.values} />

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
      </main>
      <SocialShareBar title="About Mallan Real Estate" />
    </div>
  );
}
