import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us | Mallan Real Estate',
  description: 'Contact Mallan Real Estate Inc. for buying, selling, or renting in NYC. Call (646) 258-4460 or send us a message.',
  alternates: { canonical: 'https://mallan.nyc/contact' },
  openGraph: {
    title: 'Contact Us | Mallan Real Estate',
    description: 'Contact Mallan Real Estate Inc. for buying, selling, or renting in NYC. Call (646) 258-4460 or send us a message.',
    url: 'https://mallan.nyc/contact',
  },
  twitter: {
    title: 'Contact Us | Mallan Real Estate',
    description: 'Contact Mallan Real Estate Inc. for buying, selling, or renting in NYC. Call (646) 258-4460 or send us a message.',
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
