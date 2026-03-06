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
  blue: { text: 'text-blue-600', activeBg: 'bg-blue-50', activeRing: 'ring-blue-400' },
  purple: { text: 'text-purple-600', activeBg: 'bg-purple-50', activeRing: 'ring-purple-400' },
  green: { text: 'text-green-600', activeBg: 'bg-green-50', activeRing: 'ring-green-400' },
  teal: { text: 'text-teal-600', activeBg: 'bg-teal-50', activeRing: 'ring-teal-400' },
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
  const [comingSoon, setComingSoon] = useState('');

  function handleSocialClick(provider: string) {
    setComingSoon(provider);
    setTimeout(() => setComingSoon(''), 2500);
  }

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
    }
    setError('');
  }

  function goBack() {
    if (step === 'role') { setStep('profile'); setError(''); }
    else if (step === 'profile') { setStep('method'); setError(''); }
  }

  function goToRoleStep(e: React.FormEvent) {
    e.preventDefault();
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

  // ─── Success ───
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans">
        <Header dark />
        <main className="pt-20 py-16">
          <div className="max-w-md mx-auto px-4 text-center">
            <div className="glass-card rounded-3xl p-8 sm:p-10">
              <div className="w-14 h-14 bg-green-50/60 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-display font-semibold mb-2">Welcome, {firstName || 'there'}!</h1>
              <p className="text-brand-dark/60 text-sm mb-2">Your account has been created.</p>
              <div className="flex flex-wrap gap-1.5 justify-center mb-5">
                {selectedRoles.map(r => {
                  const role = roles.find(x => x.id === r);
                  return role ? (
                    <span key={r} className="px-2.5 py-0.5 bg-brand-gold/10 text-brand-dark text-xs rounded-full font-medium">
                      {role.label}
                    </span>
                  ) : null;
                })}
              </div>
              <div className="flex flex-col gap-2.5">
                <Link
                  href="/sign-in"
                  className="px-5 py-2.5 bg-brand-dark text-white rounded-xl hover:bg-brand-dark/90 transition-colors text-sm font-medium"
                >
                  Sign In Now
                </Link>
                <Link
                  href="/"
                  className="px-5 py-2.5 ring-1 ring-brand-dark/20 text-brand-dark rounded-xl hover:bg-black/3 transition-colors text-xs"
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
          <div className="glass-card rounded-3xl p-8 sm:p-10">

            {/* ─── Step 1: Choose Method ─── */}
            {step === 'method' && (
              <>
                <h1 className="text-2xl font-display font-bold text-center mb-3">Create Account</h1>
                <p className="text-brand-dark text-center text-base font-semibold mb-8">
                  Buyers &middot; Renters &middot; Sellers &middot; Landlords
                </p>

                {/* Social Auth */}
                <div className="space-y-3 mb-6">
                  <button
                    type="button"
                    onClick={() => handleSocialClick('Google')}
                    className="w-full flex items-center gap-4 px-5 py-3 rounded-2xl ring-1 ring-black/10 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-brand-dark cursor-pointer"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Continue with Google</span>
                  </button>

                  {/* LinkedIn */}
                  <button
                    type="button"
                    onClick={() => handleSocialClick('LinkedIn')}
                    className="w-full flex items-center gap-4 px-5 py-3 rounded-2xl bg-[#0A66C2] text-white hover:bg-[#004182] transition-colors text-sm font-medium cursor-pointer"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    <span>Continue with LinkedIn</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSocialClick('Facebook')}
                    className="w-full flex items-center gap-4 px-5 py-3 rounded-2xl bg-[#1877F2] text-white hover:bg-[#166FE5] transition-colors text-sm font-medium cursor-pointer"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    <span>Continue with Facebook</span>
                  </button>

                </div>

                {/* Coming Soon toast */}
                {comingSoon && (
                  <div className="mb-4 p-3 rounded-2xl bg-brand-gold/10 text-brand-dark text-sm text-center font-medium animate-pulse">
                    {comingSoon} sign-up coming soon!
                  </div>
                )}

                {/* Divider */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1 h-px bg-black/10" />
                  <span className="text-xs text-brand-dark/40 font-medium">or continue with email</span>
                  <div className="flex-1 h-px bg-black/10" />
                </div>

                {/* Continue with Email */}
                <button
                  type="button"
                  onClick={() => selectMethod('email')}
                  className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl ring-1 ring-black/10 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-brand-dark cursor-pointer"
                >
                  <svg className="w-5 h-5 text-brand-dark/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Continue with Email
                </button>

                {/* Agent Note */}
                <div className="flex items-center gap-2 p-3 mt-6 bg-amber-50/60 ring-1 ring-amber-200/60 rounded-2xl">
                  <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-amber-800/80">
                    Licensed agents? <Link href="/sign-in" className="font-semibold underline">Sign in here</Link>
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
                <div className="flex items-center mb-5">
                  <button
                    type="button"
                    onClick={goBack}
                    className="p-1.5 -ml-1.5 rounded-lg hover:bg-black/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <svg className="w-4.5 h-4.5 text-brand-dark/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h1 className="text-lg font-display font-semibold text-center flex-1 pr-8">Your Information</h1>
                </div>

                {/* Step dots */}
                <div className="flex items-center justify-center gap-1.5 mb-5">
                  <div className="w-6 h-1 rounded-full bg-brand-gold" />
                  <div className="w-6 h-1 rounded-full bg-black/8" />
                </div>

                <form className="space-y-3" onSubmit={goToRoleStep}>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      required
                      autoFocus
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      className="w-full rounded-xl px-3.5 py-2.5 bg-white/60 ring-1 ring-black/8 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                      placeholder="First name"
                    />
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      className="w-full rounded-xl px-3.5 py-2.5 bg-white/60 ring-1 ring-black/8 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                      placeholder="Last name"
                    />
                  </div>

                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full rounded-xl px-3.5 py-2.5 bg-white/60 ring-1 ring-black/8 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                    placeholder="Email address"
                  />

                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full rounded-xl px-3.5 py-2.5 bg-white/60 ring-1 ring-black/8 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                    placeholder="Phone number"
                  />

                  {authMethod === 'email' && (
                    <div>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full rounded-xl px-3.5 py-2.5 bg-white/60 ring-1 ring-black/8 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                        placeholder="Create a password"
                      />
                      <p className={`text-[11px] mt-1 ${password && password.length < 8 ? 'text-red-500' : 'text-brand-dark/35'}`}>
                        {password && password.length < 8
                          ? `${8 - password.length} more character${8 - password.length === 1 ? '' : 's'} needed`
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
                    <div className="p-2.5 bg-red-50/60 ring-1 ring-red-200 rounded-xl text-xs text-red-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-brand-dark text-white py-2.5 rounded-xl hover:bg-brand-dark/90 transition-colors text-sm font-medium cursor-pointer"
                  >
                    Continue
                  </button>
                </form>
              </>
            )}

            {/* ─── Step 3: Role Selection ─── */}
            {step === 'role' && (
              <>
                <div className="flex items-center mb-5">
                  <button
                    type="button"
                    onClick={goBack}
                    className="p-1.5 -ml-1.5 rounded-lg hover:bg-black/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <svg className="w-4.5 h-4.5 text-brand-dark/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h1 className="text-lg font-display font-semibold text-center flex-1 pr-8">I&apos;m interested in...</h1>
                </div>

                {/* Step dots */}
                <div className="flex items-center justify-center gap-1.5 mb-5">
                  <div className="w-6 h-1 rounded-full bg-brand-gold" />
                  <div className="w-6 h-1 rounded-full bg-brand-gold" />
                </div>

                <p className="text-brand-dark/40 text-center text-xs mb-4">
                  Select all that apply
                </p>

                <div className="space-y-2">
                  {roles.map((role) => {
                    const c = colorMap[role.color];
                    const isActive = selectedRoles.includes(role.id);
                    return (
                      <button
                        type="button"
                        key={role.id}
                        onClick={() => toggleRole(role.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ring-1.5 transition-all text-left ${
                          isActive
                            ? `${c.activeBg} ${c.activeRing} ${c.text}`
                            : 'bg-white/60 ring-black/6 text-brand-dark/70 hover:ring-black/12 hover:bg-white/80'
                        }`}
                      >
                        <div className={`w-4.5 h-4.5 rounded-full ring-1.5 flex items-center justify-center flex-shrink-0 ${
                          isActive ? `${c.activeRing} ${c.activeBg}` : 'ring-black/15'
                        }`}>
                          {isActive && (
                            <svg className={`w-2.5 h-2.5 ${c.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{role.label}</div>
                          <div className={`text-[11px] ${isActive ? `${c.text} opacity-70` : 'text-brand-dark/35'}`}>
                            {role.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {error && (
                  <div className="mt-3 p-2.5 bg-red-50/60 ring-1 ring-red-200 rounded-xl text-xs text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={selectedRoles.length === 0 || submitting}
                  className={`w-full mt-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    selectedRoles.length > 0 && !submitting
                      ? 'bg-brand-dark text-white hover:bg-brand-dark/90 cursor-pointer'
                      : 'bg-black/5 text-brand-dark/30 cursor-not-allowed'
                  }`}
                >
                  {submitting ? 'Creating Account...' : 'Create Account'}
                </button>
              </>
            )}

            {/* Help — always visible */}
            <div className="mt-5 text-center">
              <div className="flex gap-3 justify-center text-[11px]">
                <Link href="/agents" className="text-brand-gold hover:underline">
                  Contact an Agent
                </Link>
                <span className="text-brand-dark/15">|</span>
                <a href="tel:+16462584460" className="text-brand-gold hover:underline">
                  (646) 258-4460
                </a>
              </div>
            </div>
          </div>

          <p className="text-center text-[10px] text-brand-dark/30 mt-5">
            By creating an account, you agree to our{' '}
            <Link href="/terms" className="hover:text-brand-gold underline">Terms</Link>
            {' '}&amp;{' '}
            <Link href="/privacy" className="hover:text-brand-gold underline">Privacy Policy</Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
