import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import Link from 'next/link';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Sign In | Mallan Real Estate',
  description: 'Sign in to your Mallan Real Estate account to access saved searches, favorites, and more.',
  alternates: { canonical: 'https://mallan.nyc/sign-in' },
  robots: { index: false, follow: true },
};

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main className="pt-20 py-16">
        <div className="max-w-md mx-auto px-4">
          <div className="bg-white rounded-lg shadow-sm border p-8">
            <h1 className="text-2xl font-semibold text-center mb-2">Sign In</h1>
            <p className="text-gray-500 text-center text-sm mb-8">
              Access your Mallan Real Estate account
            </p>

            {/* Placeholder Form - disabled, no submission */}
            <form className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-gold/50"
                  placeholder="you@example.com"
                  disabled
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-gold/50"
                  placeholder="Your password"
                  disabled
                />
              </div>

              <button
                type="button"
                className="w-full bg-gray-300 text-gray-500 py-3 rounded-lg cursor-not-allowed"
                disabled
              >
                Sign In (Coming Soon)
              </button>
            </form>

            {/* Coming Soon Notice */}
            <div className="mt-8 p-4 bg-brand-gold/10 rounded-lg text-center">
              <p className="text-sm text-brand-dark font-medium mb-2">
                Account access coming soon
              </p>
              <p className="text-xs text-gray-600">
                We&apos;re working on bringing you a personalized experience with saved
                searches, favorites, and more.
              </p>
            </div>

            {/* Contact Alternative */}
            <div className="mt-8 pt-6 border-t text-center">
              <p className="text-gray-600 text-sm mb-4">
                Need immediate assistance?
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/agents"
                  className="inline-block px-6 py-2 bg-brand-dark text-white rounded hover:bg-gray-800 transition-colors text-sm"
                >
                  Contact an Agent
                </Link>
                <a
                  href="tel:+16462584460"
                  className="inline-block px-6 py-2 border border-brand-dark text-brand-dark rounded hover:bg-gray-50 transition-colors text-sm"
                >
                  Call Us
                </a>
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <p className="text-center text-xs text-gray-400 mt-6">
            By signing in, you agree to our{' '}
            <Link href="/terms" className="hover:text-brand-gold">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="hover:text-brand-gold">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
