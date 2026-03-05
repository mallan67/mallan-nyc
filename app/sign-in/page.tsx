'use client';

import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const portalTypes = [
  { id: 'buyer', label: 'Buyer', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', color: 'blue' },
  { id: 'renter', label: 'Renter', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z', color: 'purple' },
  { id: 'seller', label: 'Seller', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'green' },
  { id: 'landlord', label: 'Landlord', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', color: 'teal' },
  { id: 'agent', label: 'Agent', icon: 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2', color: 'amber' },
];

const colorMap: Record<string, { bg: string; text: string; border: string; activeBg: string; activeBorder: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-gray-200', activeBg: 'bg-blue-100', activeBorder: 'border-blue-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-gray-200', activeBg: 'bg-purple-100', activeBorder: 'border-purple-500' },
  green: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-gray-200', activeBg: 'bg-green-100', activeBorder: 'border-green-500' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-gray-200', activeBg: 'bg-teal-100', activeBorder: 'border-teal-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-gray-200', activeBg: 'bg-amber-100', activeBorder: 'border-amber-500' },
};

// Map UI labels to the portalType the login API expects
const portalApiMap: Record<string, string> = {
  buyer: 'buyer',
  renter: 'tenant',
  seller: 'seller',
  landlord: 'landlord',
  agent: 'agent',
};

export default function SignInPage() {
  const router = useRouter();
  const [selectedPortal, setSelectedPortal] = useState('agent');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [userName, setUserName] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      setForgotMessage(data.message || 'If an account exists, a reset link has been sent.');
    } catch {
      setForgotMessage('Network error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          portalType: portalApiMap[selectedPortal] || 'agent',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed. Please try again.');
        setLoading(false);
        return;
      }

      setUserName(data.user?.name || '');
      setSubmitted(true);

      // Redirect based on role after short delay so user sees success
      const role = data.user?.role || selectedPortal;
      const isAgent = role === 'broker' || role === 'agent';
      setTimeout(() => {
        router.push(isAgent ? '/crm/MALLAN-NYC-CRM-FINAL2.html' : '/portal');
      }, 1500);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    const portal = portalTypes.find(p => p.id === selectedPortal);
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans">
        <Header dark />
        <main className="pt-20 py-16">
          <div className="max-w-md mx-auto px-4 text-center">
            <div className="glass-card rounded-3xl p-10">
              <div className="w-16 h-16 bg-green-50/60 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-display font-semibold mb-2">
                {userName ? `Welcome, ${userName}` : 'Signed In'}
              </h1>
              <p className="text-brand-dark/60 mb-4">
                Redirecting to your <strong>{portal?.label}</strong> portal...
              </p>
              <div className="w-full bg-black/5 rounded-full h-1.5 mb-6">
                <div className="bg-brand-gold h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <p className="text-xs text-brand-dark/40">
                Portal access is being set up. Your agent will provide full login details.
              </p>
              <Link
                href="/"
                className="inline-block mt-6 px-6 py-3 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 transition-colors text-sm font-medium"
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
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <Header dark />
      <main className="pt-20 py-16">
        <div className="max-w-md mx-auto px-4">
          <div className="glass-card rounded-3xl p-10">
            <h1 className="text-2xl font-display font-semibold text-center mb-2">Sign In</h1>
            <p className="text-brand-dark/50 text-center text-sm mb-8">
              Access your Mallan Real Estate portal
            </p>

            {/* Portal Type Selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-3">Sign in as</label>
              <div className="grid grid-cols-5 gap-2">
                {portalTypes.map((portal) => {
                  const c = colorMap[portal.color];
                  const isActive = selectedPortal === portal.id;
                  return (
                    <button
                      type="button"
                      key={portal.id}
                      onClick={() => setSelectedPortal(portal.id)}
                      className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl ring-2 transition-all text-xs font-medium ${
                        isActive
                          ? `${c.activeBg} ${c.activeBorder.replace('border-', 'ring-')} ${c.text}`
                          : 'bg-white/60 ring-black/5 text-brand-dark/60 hover:ring-black/10 hover:bg-white/80'
                      }`}
                    >
                      <svg className={`w-5 h-5 ${isActive ? c.text : 'text-brand-dark/40'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                  placeholder="Your password"
                />
              </div>

              {error && (
                <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-sm text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-dark text-white py-3 rounded-2xl hover:bg-brand-dark/90 transition-colors font-medium disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-sm text-brand-gold hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            </form>

            {showForgot && (
              <div className="mt-4 p-4 bg-gray-50/50 rounded-2xl">
                <p className="text-sm font-medium mb-3">Reset your password</p>
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                    placeholder="Enter your email address"
                  />
                  {forgotMessage && (
                    <p className={`text-sm ${forgotMessage.includes('error') ? 'text-red-600' : 'text-green-600'}`}>
                      {forgotMessage}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="flex-1 bg-brand-gold text-white py-2.5 rounded-2xl hover:bg-brand-gold/90 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowForgot(false); setForgotMessage(''); }}
                      className="px-4 py-2.5 text-sm text-brand-dark/60 hover:text-brand-dark rounded-2xl ring-1 ring-black/5"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Portal Routing Info */}
            <div className="mt-6 p-4 bg-gray-50/50 rounded-2xl">
              <p className="text-xs font-medium text-brand-dark/70 mb-2">After sign in you&apos;ll see your portal:</p>
              <div className="space-y-1.5 text-xs text-brand-dark/60">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  <span><strong>Buyer / Renter</strong> — Saved searches, tours, applications</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <span><strong>Seller / Landlord</strong> — Listing performance, showings, offers</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  <span><strong>Agent</strong> — Dashboard, clients, listings, pipeline</span>
                </div>
              </div>
            </div>

            {/* Sign Up Link */}
            <div className="mt-6 pt-6 border-t border-black/5 text-center">
              <p className="text-brand-dark/60 text-sm mb-4">
                Don&apos;t have an account?
              </p>
              <Link
                href="/sign-up"
                className="inline-block w-full px-6 py-3 ring-2 ring-brand-dark text-brand-dark rounded-2xl hover:bg-white/40 transition-colors text-sm font-medium"
              >
                Create Account
              </Link>
            </div>

            {/* Contact */}
            <div className="mt-4 text-center">
              <p className="text-brand-dark/50 text-xs mb-2">Need help?</p>
              <div className="flex gap-3 justify-center">
                <Link href="/agents" className="text-xs text-brand-gold hover:underline">
                  Contact an Agent
                </Link>
                <span className="text-brand-dark/20">|</span>
                <a href="tel:+16462584460" className="text-xs text-brand-gold hover:underline">
                  (646) 258-4460
                </a>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-brand-dark/40 mt-6">
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
