import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mallan Real Estate Inc.',
    short_name: 'Mallan NYC',
    description:
      'Full-service NYC real estate brokerage specializing in residential sales and rentals across Manhattan and Brooklyn.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FEFEFE',
    theme_color: '#1a1a1a',
    icons: [
      {
        src: '/images/mallan-m-icon.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/images/mallan-logo.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
