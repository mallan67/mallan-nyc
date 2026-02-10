import Link from 'next/link';
import type { NeighborhoodCTAs } from '@/lib/types/neighborhood';

interface NeighborhoodCTASectionProps {
  name: string;
  ctas: NeighborhoodCTAs;
}

export default function NeighborhoodCTASection({
  name,
  ctas,
}: NeighborhoodCTASectionProps) {
  return (
    <section
      aria-label={`${name} Real Estate Actions`}
      className="py-10 sm:py-14"
    >
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-2xl sm:text-3xl font-sans font-semibold text-gray-900 mb-3">
          Ready to Explore {name}?
        </h2>
        <p className="text-gray-500 mb-8 max-w-xl mx-auto">
          Whether you&rsquo;re buying, renting, or investing, our team knows
          every block. Let us help you find your place.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={ctas.primary.href}
            className="inline-block px-8 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors text-sm sm:text-base tracking-wide"
          >
            {ctas.primary.label}
          </Link>
          <Link
            href={ctas.secondary.href}
            className="inline-block px-8 py-3 border border-gray-900 text-gray-900 font-medium rounded-lg hover:bg-gray-900 hover:text-white transition-colors text-sm sm:text-base tracking-wide"
          >
            {ctas.secondary.label}
          </Link>
          <Link
            href={ctas.rental.href}
            className="inline-block px-8 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:border-gray-900 hover:text-gray-900 transition-colors text-sm sm:text-base tracking-wide"
          >
            {ctas.rental.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
