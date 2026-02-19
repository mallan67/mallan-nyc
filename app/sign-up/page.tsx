'use client';

import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import Link from 'next/link';
import { useState } from 'react';

const roles = [
  {
    id: 'buyer',
    label: 'Buyer',
    description: 'I want to buy a property',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    color: 'blue',
  },
  {
    id: 'renter',
    label: 'Renter',
    description: 'I want to rent a property',
    icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
    color: 'purple',
  },
  {
    id: 'seller',
    label: 'Seller',
    description: 'I want to sell my property',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    color: 'green',
  },
  {
    id: 'landlord',
    label: 'Landlord',
    description: 'I want to rent out my property',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    color: 'teal',
  },
];

const colorMap: Record<string, { bg: string; border: string; text: string; activeBg: string; activeBorder: string }> = {
  blue: { bg: 'bg-blue-50', border: 'border-gray-200', text: 'text-blue-600', activeBg: 'bg-blue-100', activeBorder: 'border-blue-500' },
  purple: { bg: 'bg-purple-50', border: 'border-gray-200', text: 'text-purple-600', activeBg: 'bg-purple-100', activeBorder: 'border-purple-500' },
  green: { bg: 'bg-green-50', border: 'border-gray-200', text: 'text-green-600', activeBg: 'bg-green-100', activeBorder: 'border-green-500' },
  teal: { bg: 'bg-teal-50', border: 'border-gray-200', text: 'text-teal-600', activeBg: 'bg-teal-100', activeBorder: 'border-teal-500' },
};

export default function SignUpPage() {
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Pre-select role from URL param (e.g., /sign-up?role=seller)
  useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const role = params.get('role');
      if (role && roles.some(r => r.id === role)) {
        setSelectedRoles([role]);
      }
    }
  });

  function toggleRole(id: string) {
    setSelectedRoles(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          roles: selectedRoles,
          website: (document.getElementById('website') as HTMLInputElement)?.value || '',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] font-sans">
        <Header dark />
        <main className="pt-20 py-16">
          <div className="max-w-md mx-auto px-4 text-center">
            <div className="glass-card rounded-3xl p-10">
              <div className="w-16 h-16 bg-green-50/60 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-display font-semibold mb-2">Welcome, {firstName || 'there'}!</h1>
              <p className="text-brand-dark/60 mb-2">Your account has been created successfully.</p>
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                {selectedRoles.map(r => {
                  const role = roles.find(x => x.id === r);
                  return role ? (
                    <span key={r} className="px-3 py-1 bg-brand-gold/10 text-brand-dark text-sm rounded-full font-medium">
                      {role.label}
                    </span>
                  ) : null;
                })}
              </div>
              <p className="text-sm text-brand-dark/50 mb-6">
                Your agent will reach out shortly to set up your personalized portal.
                You&apos;ll receive an email with login details.
              </p>
              <div className="flex flex-col gap-3">
                <Link
                  href="/"
                  className="px-6 py-3 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 transition-colors text-sm font-medium"
                >
                  Browse Properties
                </Link>
                <Link
                  href="/agents"
                  className="px-6 py-3 ring-1 ring-brand-dark text-brand-dark rounded-2xl hover:bg-white/40 transition-colors text-sm"
                >
                  Contact an Agent
                </Link>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans">
      <Header dark />
      <main className="pt-20 py-16">
        <div className="max-w-lg mx-auto px-4">
          <div className="glass-card rounded-3xl p-10">
            <h1 className="text-2xl font-display font-semibold text-center mb-2">Create Your Account</h1>
            <p className="text-brand-dark/50 text-center text-sm mb-8">
              Join Mallan Real Estate to access your personalized portal
            </p>

            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    required
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    required
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    placeholder="Last name"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                  placeholder="you@example.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  id="phone"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                  placeholder="(212) 555-0100"
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="password"
                  required
                  minLength={8}
                  className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                  placeholder="Create a password (min 8 characters)"
                />
              </div>

              {/* Honeypot — hidden from humans, bots auto-fill it */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
                <label htmlFor="website">Website</label>
                <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
              </div>

              {/* Role Picker */}
              <div>
                <label className="block text-sm font-medium mb-3">
                  I&apos;m interested in... <span className="text-red-500">*</span>
                  <span className="text-brand-dark/40 font-normal ml-1">(select all that apply)</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {roles.map((role) => {
                    const c = colorMap[role.color];
                    const isActive = selectedRoles.includes(role.id);
                    return (
                      <button
                        type="button"
                        key={role.id}
                        onClick={() => toggleRole(role.id)}
                        className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl ring-2 transition-all text-xs font-medium ${
                          isActive
                            ? `${c.activeBg} ${c.activeBorder.replace('border-', 'ring-')} ${c.text}`
                            : 'bg-white/60 ring-black/5 text-brand-dark/60 hover:ring-black/10 hover:bg-white/80'
                        }`}
                      >
                        <svg className={`w-5 h-5 ${isActive ? c.text : 'text-brand-dark/40'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={role.icon} />
                        </svg>
                        {role.label}
                      </button>
                    );
                  })}
                </div>
                {selectedRoles.length === 0 && (
                  <p className="text-xs text-brand-dark/40 mt-2">Please select at least one</p>
                )}
              </div>

              {/* Agent Login Note */}
              <div className="flex items-center gap-2 p-3 bg-amber-50/60 ring-1 ring-amber-200 rounded-2xl">
                <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-amber-800">
                  Licensed agents? <Link href="/sign-in" className="font-semibold underline">Sign in here</Link> with your agent credentials.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50/60 ring-1 ring-red-200 rounded-2xl text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={selectedRoles.length === 0 || submitting}
                className={`w-full py-3 rounded-2xl font-medium transition-colors ${
                  selectedRoles.length > 0 && !submitting
                    ? 'bg-brand-dark text-white hover:bg-brand-dark/90 cursor-pointer'
                    : 'bg-black/5 text-brand-dark/40 cursor-not-allowed'
                }`}
              >
                {submitting ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>

            {/* Sign In Link */}
            <div className="mt-6 pt-6 border-t border-black/5 text-center">
              <p className="text-brand-dark/60 text-sm">
                Already have an account?{' '}
                <Link href="/sign-in" className="text-brand-gold font-semibold hover:underline">
                  Sign In
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-brand-dark/40 mt-6">
            By creating an account, you agree to our{' '}
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
