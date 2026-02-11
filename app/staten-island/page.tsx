import { Metadata } from 'next';
import BoroughHubPage from '@/app/components/neighborhoods/BoroughHubPage';
import { loadNeighborhoods, getBoroughConfig } from '@/lib/neighborhoods/boroughs';

const config = getBoroughConfig('staten-island');
const neighborhoods = loadNeighborhoods('staten-island');

export const metadata: Metadata = {
  title: 'Staten Island Neighborhoods | Real Estate Guide | Mallan Real Estate',
  description:
    'Explore Staten Island neighborhoods with market data, featured homes, and listings. From St. George to Todt Hill, find your perfect Staten Island home.',
  alternates: { canonical: 'https://mallan.nyc/staten-island' },
  openGraph: {
    title: 'Staten Island Neighborhoods | Real Estate Guide | Mallan Real Estate',
    description:
      'Explore Staten Island neighborhoods with market data, featured homes, and listings.',
    url: 'https://mallan.nyc/staten-island',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Staten Island Neighborhoods | Real Estate Guide | Mallan Real Estate',
    description:
      'Explore Staten Island neighborhoods with market data, featured homes, and listings.',
  },
};

const hubFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What are the best neighborhoods to buy on Staten Island?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Staten Island offers distinct neighborhoods for different lifestyles. Todt Hill is the borough\u2019s premier residential area with large homes and private lots. St. George features waterfront development and easy ferry access to Manhattan. Great Kills offers suburban living with waterfront parks. New Brighton provides historic homes near the cultural district.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do you commute from Staten Island to Manhattan?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Staten Island Ferry provides free 25-minute service between St. George and Whitehall Terminal in Lower Manhattan. Express buses (SIM lines) connect various neighborhoods to Midtown. The Staten Island Railway runs from St. George to Tottenville. Many residents also drive via the Verrazzano-Narrows Bridge.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are Staten Island home prices like?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Staten Island offers NYC\u2019s most affordable real estate. Median home prices range from $500,000-$600,000, with Todt Hill commanding premiums of $800,000-$2,000,000+. The borough offers significantly more space per dollar than other boroughs, with many detached single-family homes with yards.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is Staten Island a good investment?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Staten Island has seen steady appreciation, particularly in the North Shore near the ferry terminal. The St. George waterfront development, new retail projects, and improved infrastructure are driving demand. The borough offers strong rental yields compared to other parts of NYC due to lower acquisition costs.',
      },
    },
  ],
};

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mallan.nyc' },
    { '@type': 'ListItem', position: 2, name: 'Staten Island', item: 'https://mallan.nyc/staten-island' },
  ],
};

export const revalidate = 3600;

export default function StatenIslandHubPage() {
  return (
    <BoroughHubPage
      borough="Staten Island"
      boroughSlug="staten-island"
      neighborhoods={neighborhoods}
      heroImage={config.heroImage}
      intro={config.intro}
      faqs={hubFaqSchema.mainEntity}
      faqSchema={hubFaqSchema}
      breadcrumbSchema={breadcrumbSchema}
    />
  );
}
