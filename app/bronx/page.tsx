import { Metadata } from 'next';
import BoroughHubPage from '@/app/components/neighborhoods/BoroughHubPage';
import { loadNeighborhoods, getBoroughConfig } from '@/lib/neighborhoods/boroughs';

const config = getBoroughConfig('bronx');
const neighborhoods = loadNeighborhoods('bronx');

export const metadata: Metadata = {
  title: 'Bronx Neighborhoods | Real Estate Guide | Mallan Real Estate',
  description:
    'Explore Bronx neighborhoods with market data, featured buildings, and listings. From Riverdale to Mott Haven, find your perfect Bronx home.',
  alternates: { canonical: 'https://mallan.nyc/bronx' },
  openGraph: {
    title: 'Bronx Neighborhoods | Real Estate Guide | Mallan Real Estate',
    description:
      'Explore Bronx neighborhoods with market data, featured buildings, and listings.',
    url: 'https://mallan.nyc/bronx',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bronx Neighborhoods | Real Estate Guide | Mallan Real Estate',
    description:
      'Explore Bronx neighborhoods with market data, featured buildings, and listings.',
  },
};

const hubFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What are the best neighborhoods to buy in the Bronx?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Bronx offers a wide range of options. Riverdale is known for spacious detached homes, low-density blocks, and a suburban-style residential character. City Island provides a unique waterfront village atmosphere. Mott Haven features new developments and significant investment activity. Pelham Bay offers more accessible price points near the city\u2019s largest park.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is the Bronx a good place to invest in real estate?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Bronx offers some of NYC\u2019s strongest investment potential with the lowest median prices of any borough. Mott Haven and the waterfront areas have attracted significant development. Proximity to Manhattan, improving transit, and relative affordability make the Bronx attractive for investors seeking appreciation.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are Bronx rental prices like?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Bronx median rent is approximately $1,800-$2,200 per month for a one-bedroom. Riverdale commands higher rents at $2,000-$2,800 due to its amenities. Mott Haven new construction averages $2,200-$3,000. More established neighborhoods offer apartments from $1,500-$2,000.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is transit access in the Bronx?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Bronx is served by multiple subway lines including the 1, 2, 4, 5, 6, B, and D trains. Riverdale is served by the 1 train and Metro-North Railroad. Mott Haven has 2, 4, 5, and 6 service. The Bx12 Select Bus Service provides crosstown rapid transit. Metro-North offers express service to Grand Central.',
      },
    },
  ],
};

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mallan.nyc' },
    { '@type': 'ListItem', position: 2, name: 'Bronx', item: 'https://mallan.nyc/bronx' },
  ],
};

export const revalidate = 3600;

export default function BronxHubPage() {
  return (
    <BoroughHubPage
      borough="Bronx"
      boroughSlug="bronx"
      neighborhoods={neighborhoods}
      heroImage={config.heroImage}
      intro={config.intro}
      faqs={hubFaqSchema.mainEntity}
      faqSchema={hubFaqSchema}
      breadcrumbSchema={breadcrumbSchema}
    />
  );
}
