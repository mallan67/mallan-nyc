import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account | Mallan Real Estate',
  description: 'Create your Mallan Real Estate account to access your personalized portal — whether you are buying, renting, selling, or managing a rental property.',
  alternates: { canonical: 'https://mallan.nyc/sign-up' },
  robots: { index: false, follow: true },
};

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
