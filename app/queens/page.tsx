import { Metadata } from 'next';
import BoroughHubPage from '@/app/components/neighborhoods/BoroughHubPage';
import { loadNeighborhoods, getBoroughConfig } from '@/lib/neighborhoods/boroughs';

const config = getBoroughConfig('queens');
const neighborhoods = loadNeighborhoods('queens');

export const metadata: Metadata = {
  title: 'Queens Neighborhoods | Real Estate Guide | Mallan Real Estate',
  description:
    'Explore Queens neighborhoods with market data, featured buildings, and listings. From Astoria to Forest Hills, find your perfect Queens home.',
  alternates: { canonical: 'https://mallan.nyc/queens' },
  openGraph: {
    title: 'Queens Neighborhoods | Real Estate Guide | Mallan Real Estate',
    description:
      'Explore Queens neighborhoods with market data, featured buildings, and listings.',
    url: 'https://mallan.nyc/queens',
  },
  twitter: {
    title: 'Queens Neighborhoods | Real Estate Guide | Mallan Real Estate',
    description:
      'Explore Queens neighborhoods with market data, featured buildings, and listings.',
  },
};

const hubFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What are the best neighborhoods to buy in Queens?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Queens offers excellent options at various price points. Long Island City features modern high-rises with Manhattan views. Forest Hills is known for Tudor homes and garden apartments. Astoria offers diverse dining and walkable streets. Bayside provides suburban living with city convenience.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is Queens a good investment for real estate?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Queens offers strong investment potential with lower entry points than Manhattan or Brooklyn. Long Island City and Astoria have seen significant appreciation. The borough benefits from major transit connections, diverse economic drivers, and continued development. Many investors find attractive cap rates compared to other boroughs.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are Queens rental prices like?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Queens median rent is approximately $2,200-$2,800 per month for a one-bedroom. Long Island City commands premium rents of $3,000-$4,000, while Astoria averages $2,200-$2,800. Forest Hills, Sunnyside, and Jackson Heights offer more affordable options at $1,800-$2,500.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is transit access in Queens?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Queens has extensive subway and bus service. Long Island City and Astoria are served by the N, W, 7, E, M, R lines with quick Manhattan access. The 7 train connects Jackson Heights, Sunnyside, and Flushing. Forest Hills uses the E, F, M, R lines. The LIRR provides express service from several Queens stations.',
      },
    },
  ],
};

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mallan.nyc' },
    { '@type': 'ListItem', position: 2, name: 'Queens', item: 'https://mallan.nyc/queens' },
  ],
};

export const revalidate = 3600;

export default function QueensHubPage() {
  return (
    <BoroughHubPage
      borough="Queens"
      boroughSlug="queens"
      neighborhoods={neighborhoods}
      heroImage={config.heroImage}
      intro={config.intro}
      faqs={hubFaqSchema.mainEntity}
      faqSchema={hubFaqSchema}
      breadcrumbSchema={breadcrumbSchema}
    />
  );
}
