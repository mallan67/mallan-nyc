import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import neighborhoodsData from '@/data/neighborhoods.json';

export const metadata: Metadata = {
  title: 'NYC Neighborhoods | Mallan Real Estate',
  description: 'Explore Manhattan neighborhoods with Mallan Real Estate. Find the perfect area for your lifestyle with our detailed neighborhood guides.',
};

type Neighborhood = {
  id: string;
  name: string;
  tagline: string;
  image: string;
  thumbnail: string;
  description: string;
  vibe: string;
  listingCount: number;
  avgPrice: {
    sale: number;
    rent: number;
  };
};

function formatPrice(price: number): string {
  if (price >= 1000000) {
    return `$${(price / 1000000).toFixed(1)}M`;
  }
  return `$${(price / 1000).toFixed(0)}K`;
}

function NeighborhoodCard({ neighborhood }: { neighborhood: Neighborhood }) {
  return (
    <Link
      href={`/neighborhoods/${neighborhood.id}`}
      className="group block bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300"
    >
      {/* Image */}
      <div className="relative aspect-[16/9] overflow-hidden">
        <Image
          src={neighborhood.thumbnail}
          alt={neighborhood.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-110"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <h3 className="text-xl font-serif font-medium text-white">{neighborhood.name}</h3>
          <p className="text-white/80 text-sm">{neighborhood.tagline}</p>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <p className="text-gray-600 text-sm line-clamp-2 mb-4">
          {neighborhood.description}
        </p>

        <div className="flex items-center justify-between text-sm">
          <div>
            <span className="text-gray-400">Avg. Sale:</span>{' '}
            <span className="font-medium text-gray-800">{formatPrice(neighborhood.avgPrice.sale)}</span>
          </div>
          <div>
            <span className="text-gray-400">Avg. Rent:</span>{' '}
            <span className="font-medium text-gray-800">${neighborhood.avgPrice.rent.toLocaleString()}/mo</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {neighborhood.listingCount} listings
          </span>
          <span className="text-sm text-brand-gold group-hover:underline">
            Explore neighborhood
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function NeighborhoodsPage() {
  const neighborhoods = neighborhoodsData.neighborhoods as Neighborhood[];

  return (
    <div className="min-h-screen bg-gray-50 font-serif">
      <Header />

      {/* Hero */}
      <section className="relative h-[40vh] min-h-[300px] bg-brand-dark">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1600&q=80"
            alt="Manhattan skyline"
            fill
            className="object-cover opacity-40"
            priority
          />
        </div>
        <div className="relative z-10 h-full flex items-center justify-center">
          <div className="text-center px-4">
            <h1 className="text-4xl md:text-5xl font-serif text-white mb-4">
              Explore NYC Neighborhoods
            </h1>
            <p className="text-xl text-white/80 max-w-2xl mx-auto">
              Discover the unique character and lifestyle of Manhattan&apos;s most sought-after neighborhoods
            </p>
          </div>
        </div>
      </section>

      {/* Neighborhoods Grid */}
      <main className="py-12 md:py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {neighborhoods.map((neighborhood) => (
              <NeighborhoodCard key={neighborhood.id} neighborhood={neighborhood} />
            ))}
          </div>
        </div>
      </main>

      {/* CTA */}
      <section className="py-16 bg-white border-t">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-serif mb-4">
            Not Sure Where to Start?
          </h2>
          <p className="text-gray-600 mb-8">
            Our agents are neighborhood experts who can help you find the perfect area based on your lifestyle, budget, and preferences.
          </p>
          <Link
            href="/agents"
            className="inline-block px-8 py-3 bg-brand-dark text-white font-serif rounded hover:bg-gray-800 transition-colors"
          >
            Speak with an Expert
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
