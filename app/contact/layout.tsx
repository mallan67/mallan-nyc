import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us | Mallan Real Estate',
  description: 'Contact Mallan Real Estate Inc. for buying, selling, or renting in NYC. Call (646) 258-4460 or send us a message.',
  alternates: { canonical: 'https://mallan.nyc/contact' },
  openGraph: {
    title: 'Contact Us | Mallan Real Estate',
    description: 'Contact Mallan Real Estate Inc. for buying, selling, or renting in NYC. Call (646) 258-4460 or send us a message.',
    url: 'https://mallan.nyc/contact',
    images: [{ url: 'https://mallan.nyc/images/og-default.png', width: 1200, height: 630, alt: 'Contact Mallan Real Estate' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact Us | Mallan Real Estate',
    description: 'Contact Mallan Real Estate Inc. for buying, selling, or renting in NYC. Call (646) 258-4460 or send us a message.',
    images: ['https://mallan.nyc/images/og-default.png'],
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
