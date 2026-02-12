'use client';

import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import Link from 'next/link';
import { useState } from 'react';

const portalTypes = [
  { id: 'client', label: 'Client', description: 'Buyer, Renter, Seller, or Landlord', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', color: 'blue' },
  { id: 'agent', label: 'Agent', description: 'Licensed agent portal', icon: 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2', color: 'amber' },
  { id: 'broker', label: 'Broker / Admin', description: 'Full system access', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', color: 'green' },
];

const colorMap: Record<string, { bg: string; text: string; border: string; activeBg: string; activeBorder: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-gray-200', activeBg: 'bg-blue-100', activeBorder: 'border-blue-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-gray-200', activeBg: 'bg-amber-100', activeBorder: 'border-amber-500' },
  green: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-gray-200', activeBg: 'bg-green-100', activeBorder: 'border-green-500' },
};

export default function SignInPage() {
  const [selectedPortal, setSelectedPortal] = useState('client');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
    const portal = portalTypes.find(p => p.id === selectedPortal);
    return (
      <div className="min-h-screen bg-white font-sans">
        <Header dark />
        <main className="pt-20 py-16">
          <div className="max-w-md mx-auto px-4 text-center">
            <div className="bg-white rounded-lg shadow-sm border p-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold mb-2">Signed In</h1>
              <p className="text-gray-600 mb-4">
                Redirecting to your <strong>{portal?.label}</strong> portal...
              </p>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-6">
                <div className="bg-brand-gold h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <p className="text-xs text-gray-400">
                Portal access is being set up. Your agent will provide full login details.
              </p>
              <Link
                href="/"
                className="inline-block mt-6 px-6 py-3 bg-brand-dark text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main className="pt-20 py-16">
        <div className="max-w-md mx-auto px-4">
          <div className="bg-white rounded-lg shadow-sm border p-8">
            <h1 className="text-2xl font-semibold text-center mb-2">Sign In</h1>
            <p className="text-gray-500 text-center text-sm mb-8">
              Access your Mallan Real Estate portal
            </p>

            {/* Portal Type Selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-3">Sign in as</label>
              <div className="flex gap-2">
                {portalTypes.map((portal) => {
                  const c = colorMap[portal.color];
                  const isActive = selectedPortal === portal.id;
                  return (
                    <button
                      type="button"
                      key={portal.id}
                      onClick={() => setSelectedPortal(portal.id)}
                      className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-full border-2 transition-all text-sm font-medium ${
                        isActive
                          ? `${c.activeBg} ${c.activeBorder} ${c.text}`
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <svg className={`w-4 h-4 ${isActive ? c.text : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={portal.icon} />
                      </svg>
                      {portal.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Login Form */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-gold/50"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  required
                  className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-gold/50"
                  placeholder="Your password"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-brand-dark text-white py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                Sign In
              </button>
            </form>

            {/* Portal Routing Info */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-700 mb-2">After sign in you&apos;ll see:</p>
              <div className="space-y-1.5 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  <span><strong>Clients</strong> — Your portal (saved searches, listings, documents)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  <span><strong>Agents</strong> — Agent dashboard (listings, clients, pipeline)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span><strong>Broker</strong> — Full admin CRM (all agents, all clients, compliance)</span>
                </div>
              </div>
            </div>

            {/* Sign Up Link */}
            <div className="mt-6 pt-6 border-t text-center">
              <p className="text-gray-600 text-sm mb-4">
                Don&apos;t have an account?
              </p>
              <Link
                href="/sign-up"
                className="inline-block w-full px-6 py-3 border-2 border-brand-dark text-brand-dark rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Create Account
              </Link>
            </div>

            {/* Contact */}
            <div className="mt-4 text-center">
              <p className="text-gray-500 text-xs mb-2">Need help?</p>
              <div className="flex gap-3 justify-center">
                <Link href="/agents" className="text-xs text-brand-gold hover:underline">
                  Contact an Agent
                </Link>
                <span className="text-gray-300">|</span>
                <a href="tel:+16462584460" className="text-xs text-brand-gold hover:underline">
                  (646) 258-4460
                </a>
              </div>
            </div>
          </div>

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
