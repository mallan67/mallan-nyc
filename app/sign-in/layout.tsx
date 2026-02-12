import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | Mallan Real Estate',
  description: 'Sign in to your Mallan Real Estate account to access your personalized portal.',
  alternates: { canonical: 'https://mallan.nyc/sign-in' },
  robots: { index: false, follow: true },
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
