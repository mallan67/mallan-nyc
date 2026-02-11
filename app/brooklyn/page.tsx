import { Metadata } from 'next';
import BoroughHubPage from '@/app/components/neighborhoods/BoroughHubPage';
import { loadNeighborhoods, getBoroughConfig } from '@/lib/neighborhoods/boroughs';

const config = getBoroughConfig('brooklyn');
const neighborhoods = loadNeighborhoods('brooklyn');

export const metadata: Metadata = {
  title: 'Brooklyn Neighborhoods | Real Estate Guide | Mallan Real Estate',
  description:
    'Explore Brooklyn neighborhoods with market data, featured buildings, and listings. From Brooklyn Heights to Williamsburg, find your perfect Brooklyn home.',
  alternates: { canonical: 'https://mallan.nyc/brooklyn' },
  openGraph: {
    title: 'Brooklyn Neighborhoods | Real Estate Guide | Mallan Real Estate',
    description:
      'Explore Brooklyn neighborhoods with market data, featured buildings, and listings.',
    url: 'https://mallan.nyc/brooklyn',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Brooklyn Neighborhoods | Real Estate Guide | Mallan Real Estate',
    description:
      'Explore Brooklyn neighborhoods with market data, featured buildings, and listings.',
  },
};

const hubFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What are the best neighborhoods to buy in Brooklyn?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The best Brooklyn neighborhoods depend on your lifestyle and budget. Brooklyn Heights and DUMBO offer waterfront luxury with Manhattan views. Park Slope is known for brownstone living. Williamsburg features converted lofts and vibrant culture. Cobble Hill and Carroll Gardens offer tree-lined streets with a village feel.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the average price per square foot in Brooklyn?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Brooklyn average price per square foot varies widely. DUMBO and Brooklyn Heights command $1,200-$1,800/sq ft, while Williamsburg averages $1,000-$1,400/sq ft. Park Slope ranges from $900-$1,200/sq ft. More affordable options exist in Bed-Stuy and Prospect Heights at $600-$900/sq ft.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is Brooklyn a good place to buy real estate?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Brooklyn has seen strong appreciation over the past decade and remains one of NYC\u2019s most sought-after markets. The borough offers diverse housing stock from brownstones to new construction condos, excellent transit connections, and vibrant neighborhood character. Many buyers find better value per square foot compared to Manhattan.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are Brooklyn rental prices like?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Brooklyn median rent is approximately $3,200-$3,800 per month for a one-bedroom. Studios average $2,400-$3,000, two-bedrooms $3,800-$5,500, and three-bedrooms $4,500-$7,000. Waterfront neighborhoods like DUMBO and Williamsburg command the highest rents.',
      },
    },
  ],
};

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mallan.nyc' },
    { '@type': 'ListItem', position: 2, name: 'Brooklyn', item: 'https://mallan.nyc/brooklyn' },
  ],
};

export const revalidate = 3600;

export default function BrooklynHubPage() {
  return (
    <BoroughHubPage
      borough="Brooklyn"
      boroughSlug="brooklyn"
      neighborhoods={neighborhoods}
      heroImage={config.heroImage}
      intro={config.intro}
      faqs={hubFaqSchema.mainEntity}
      faqSchema={hubFaqSchema}
      breadcrumbSchema={breadcrumbSchema}
    />
  );
}
