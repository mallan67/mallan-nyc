import Link from 'next/link';
import Image from 'next/image';

export default function TrustMarkers() {
  return (
    <section className="py-12 sm:py-16 px-4 border-t border-gray-200">
      <div className="max-w-3xl mx-auto text-center">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 text-sm text-gray-500">
          <span>NY Broker #10991205323</span>
          <span className="hidden sm:block w-px h-4 bg-gray-300" />
          <span className="inline-flex items-center gap-2">
            <Image src="/images/equal-housing-logo.svg" alt="" width={16} height={16} unoptimized />
            <Link href="/fair-housing" className="hover:text-gray-900 transition-colors">
              Fair Housing
            </Link>
          </span>
          <span className="hidden sm:block w-px h-4 bg-gray-300" />
          <span>REBNY RLS Participant</span>
        </div>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/contact" data-analytics-cta="cta_contact_footer" className="btn-dark text-sm">
            Contact Us
          </Link>
          <a href="tel:+16462584460" data-analytics-cta="cta_phone" className="btn-outline text-sm">
            (646) 258-4460
          </a>
        </div>
      </div>
    </section>
  );
}
