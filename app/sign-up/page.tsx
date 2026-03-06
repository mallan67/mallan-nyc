'use client';

import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import Link from 'next/link';
import { useState, useEffect } from 'react';

const roles = [
  { id: 'buyer', label: 'Buyer', description: 'I want to buy a property', color: 'blue' },
  { id: 'renter', label: 'Renter', description: 'I want to rent a property', color: 'purple' },
  { id: 'seller', label: 'Seller', description: 'I want to sell my property', color: 'green' },
  { id: 'landlord', label: 'Landlord', description: 'I want to rent out my property', color: 'teal' },
];

const colorMap: Record<string, { text: string; activeBg: string; activeRing: string }> = {
  blue: { text: 'text-blue-600', activeBg: 'bg-blue-100', activeRing: 'ring-blue-500' },
  purple: { text: 'text-purple-600', activeBg: 'bg-purple-100', activeRing: 'ring-purple-500' },
  green: { text: 'text-green-600', activeBg: 'bg-green-100', activeRing: 'ring-green-500' },
  teal: { text: 'text-teal-600', activeBg: 'bg-teal-100', activeRing: 'ring-teal-500' },
};

type Step = 'method' | 'profile' | 'role';

export default function SignUpPage() {
  const [step, setStep] = useState<Step>('method');
  const [authMethod, setAuthMethod] = useState<'email' | 'google' | 'facebook' | 'apple'>('email');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Pre-select role from URL param (e.g., /sign-up?role=seller)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get('role');
    if (role && roles.some(r => r.id === role)) {
      setSelectedRoles([role]);
    }
  }, []);

  function selectMethod(method: 'email' | 'google' | 'facebook' | 'apple') {
    setAuthMethod(method);
    if (method === 'email') {
      setStep('profile');
    } else {
      // Future: OAuth flow will auto-fill name/email, then go to 'profile' step
      // For now, show "Coming Soon" — this button is disabled
    }
    setError('');
  }

  function goBack() {
    if (step === 'role') { setStep('profile'); setError(''); }
    else if (step === 'profile') { setStep('method'); setError(''); }
  }

  function goToRoleStep(e: React.FormEvent) {
    e.preventDefault();
    // Validate profile fields before moving to role step
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setError('All fields are required');
      return;
    }
    if (authMethod === 'email' && (!password || password.length < 8)) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError('');
    setStep('role');
  }

  function toggleRole(id: string) {
    setSelectedRoles(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  }

  async function handleSubmit() {
    if (selectedRoles.length === 0) return;
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password,
          roles: selectedRoles,
          authMethod,
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

  // ─── Success State ───
  if (submitted) {
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
                You can now sign in and access your personalized portal.
              </p>
              <div className="flex flex-col gap-3">
                <Link
                  href="/sign-in"
                  className="px-6 py-3 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 transition-colors text-sm font-medium"
                >
                  Sign In Now
                </Link>
                <Link
                  href="/"
                  className="px-6 py-3 ring-1 ring-brand-dark text-brand-dark rounded-2xl hover:bg-white/40 transition-colors text-sm"
                >
                  Browse Properties
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
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <Header dark />
      <main className="pt-20 py-16">
        <div className="max-w-md mx-auto px-4">
          <div className="glass-card rounded-3xl p-10">

            {/* ─── Step 1: Choose Method ─── */}
            {step === 'method' && (
              <>
                <h1 className="text-2xl font-display font-semibold text-center mb-2">Create Account</h1>
                <p className="text-brand-dark/50 text-center text-sm mb-8">
                  Join Mallan Real Estate
                </p>

                <div className="space-y-3">
                  {/* Google */}
                  <button
                    type="button"
                    disabled
                    className="w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl ring-1 ring-black/10 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-brand-dark/80 disabled:opacity-40 disabled:cursor-not-allowed relative"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Continue with Google</span>
                    <span className="absolute right-4 text-[10px] text-brand-dark/30 font-normal">Coming Soon</span>
                  </button>

                  {/* Facebook */}
                  <button
                    type="button"
                    disabled
                    className="w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl bg-[#1877F2] text-white hover:bg-[#166FE5] transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed relative"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    <span>Continue with Facebook</span>
                    <span className="absolute right-4 text-[10px] text-white/50 font-normal">Coming Soon</span>
                  </button>

                  {/* Apple */}
                  <button
                    type="button"
                    disabled
                    className="w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl bg-black text-white hover:bg-black/90 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed relative"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    <span>Continue with Apple</span>
                    <span className="absolute right-4 text-[10px] text-white/50 font-normal">Coming Soon</span>
                  </button>

                  {/* Email */}
                  <button
                    type="button"
                    onClick={() => selectMethod('email')}
                    className="w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl ring-1 ring-black/10 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-brand-dark cursor-pointer"
                  >
                    <svg className="w-5 h-5 flex-shrink-0 text-brand-dark/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Continue with Email</span>
                  </button>
                </div>

                {/* Agent Note */}
                <div className="flex items-center gap-2 p-3 mt-6 bg-amber-50/60 ring-1 ring-amber-200 rounded-2xl">
                  <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-amber-800">
                    Licensed agents? <Link href="/sign-in" className="font-semibold underline">Sign in here</Link> with your agent credentials.
                  </p>
                </div>

                {/* Sign In Link */}
                <div className="mt-6 pt-6 border-t border-black/5 text-center">
                  <p className="text-brand-dark/60 text-sm">
                    Already have an account?{' '}
                    <Link href="/sign-in" className="text-brand-gold font-semibold hover:underline">
                      Sign In
                    </Link>
                  </p>
                </div>
              </>
            )}

            {/* ─── Step 2: Profile Info ─── */}
            {step === 'profile' && (
              <>
                <div className="flex items-center mb-6">
                  <button
                    type="button"
                    onClick={goBack}
                    className="p-2 -ml-2 rounded-xl hover:bg-black/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 text-brand-dark/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h1 className="text-xl font-display font-semibold text-center flex-1 pr-8">Your Information</h1>
                </div>

                {/* Step indicator */}
                <div className="flex items-center justify-center gap-2 mb-6">
                  <div className="w-8 h-1 rounded-full bg-brand-gold" />
                  <div className="w-8 h-1 rounded-full bg-black/10" />
                </div>

                <form className="space-y-4" onSubmit={goToRoleStep}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="firstName" className="block text-sm font-medium mb-1">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="firstName"
                        required
                        autoFocus
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

                  {authMethod === 'email' && (
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium mb-1">
                        Password <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        id="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                        placeholder="Create a password"
                      />
                      <p className={`text-xs mt-1.5 ${password && password.length < 8 ? 'text-red-500' : 'text-brand-dark/40'}`}>
                        {password && password.length < 8
                          ? `${8 - password.length} more character${8 - password.length === 1 ? '' : 's'} needed (minimum 8)`
                          : 'Minimum 8 characters'}
                      </p>
                    </div>
                  )}

                  {/* Honeypot */}
                  <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
                    <label htmlFor="website">Website</label>
                    <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50/60 ring-1 ring-red-200 rounded-2xl text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-brand-dark text-white py-3 rounded-2xl hover:bg-brand-dark/90 transition-colors font-medium cursor-pointer"
                  >
                    Continue
                  </button>
                </form>
              </>
            )}

            {/* ─── Step 3: Role Selection ─── */}
            {step === 'role' && (
              <>
                <div className="flex items-center mb-6">
                  <button
                    type="button"
                    onClick={goBack}
                    className="p-2 -ml-2 rounded-xl hover:bg-black/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 text-brand-dark/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h1 className="text-xl font-display font-semibold text-center flex-1 pr-8">I&apos;m interested in...</h1>
                </div>

                {/* Step indicator */}
                <div className="flex items-center justify-center gap-2 mb-6">
                  <div className="w-8 h-1 rounded-full bg-brand-gold" />
                  <div className="w-8 h-1 rounded-full bg-brand-gold" />
                </div>

                <p className="text-brand-dark/50 text-center text-sm mb-6">
                  Select all that apply, {firstName || 'there'}
                </p>

                <div className="space-y-3">
                  {roles.map((role) => {
                    const c = colorMap[role.color];
                    const isActive = selectedRoles.includes(role.id);
                    return (
                      <button
                        type="button"
                        key={role.id}
                        onClick={() => toggleRole(role.id)}
                        className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl ring-2 transition-all text-left ${
                          isActive
                            ? `${c.activeBg} ${c.activeRing} ${c.text}`
                            : 'bg-white/60 ring-black/5 text-brand-dark/70 hover:ring-black/10 hover:bg-white/80'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full ring-2 flex items-center justify-center flex-shrink-0 ${
                          isActive ? `${c.activeRing} ${c.activeBg}` : 'ring-black/15'
                        }`}>
                          {isActive && (
                            <svg className={`w-3 h-3 ${c.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{role.label}</div>
                          <div className={`text-xs ${isActive ? `${c.text} opacity-70` : 'text-brand-dark/40'}`}>
                            {role.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-red-50/60 ring-1 ring-red-200 rounded-2xl text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={selectedRoles.length === 0 || submitting}
                  className={`w-full mt-6 py-3 rounded-2xl font-medium transition-colors ${
                    selectedRoles.length > 0 && !submitting
                      ? 'bg-brand-dark text-white hover:bg-brand-dark/90 cursor-pointer'
                      : 'bg-black/5 text-brand-dark/40 cursor-not-allowed'
                  }`}
                >
                  {submitting ? 'Creating Account...' : 'Create Account'}
                </button>

                {selectedRoles.length === 0 && (
                  <p className="text-xs text-brand-dark/40 mt-3 text-center">Please select at least one</p>
                )}
              </>
            )}

            {/* Contact — always visible */}
            <div className="mt-6 text-center">
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
            By creating an account, you agree to our{' '}
            <Link href="/terms" className="hover:text-brand-gold">Terms of Service</Link>
            {' '}and{' '}
            <Link href="/privacy" className="hover:text-brand-gold">Privacy Policy</Link>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
