'use client';

import { useRouter } from 'next/navigation';
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

export default function CompleteProfilePage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    // Get current user info
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (!data.user) {
          router.push('/sign-in');
          return;
        }
        setUserName(data.user.name || '');
        if (data.user.phone) setPhone(data.user.phone);
        if (data.user.role && data.user.role !== 'buyer') {
          setSelectedRoles([data.user.role]);
        }
      })
      .catch(() => router.push('/sign-in'));
  }, [router]);

  function toggleRole(id: string) {
    setSelectedRoles(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedRoles.length === 0) {
      setError('Please select at least one role');
      return;
    }
    if (!phone.trim()) {
      setError('Phone number is required');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/portal/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), roles: selectedRoles }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }

      router.push('/portal');
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-20 py-16">
        <div className="max-w-md mx-auto px-4">
          <div className="glass-card rounded-3xl p-8 sm:p-10">
            <h1 className="text-2xl font-display font-bold text-center mb-2">Almost There!</h1>
            <p className="text-brand-dark/90 text-center text-sm mb-8">
              {userName ? `Welcome, ${userName}. ` : ''}Just a couple more details to set up your portal.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
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
                  className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/8 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                  placeholder="(212) 555-0100"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium mb-3">
                  I&apos;m interested in... <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {roles.map((role) => {
                    const c = colorMap[role.color];
                    const isActive = selectedRoles.includes(role.id);
                    return (
                      <button
                        type="button"
                        key={role.id}
                        onClick={() => toggleRole(role.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl ring-1.5 transition-all text-left ${
                          isActive
                            ? `${c.activeBg} ${c.activeRing} ${c.text}`
                            : 'bg-white/60 ring-black/6 text-brand-dark/95 hover:ring-black/12 hover:bg-white/80'
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
                          <div className="font-medium text-sm">{role.label}</div>
                          <div className={`text-xs ${isActive ? `${c.text} opacity-70` : 'text-brand-dark/70'}`}>
                            {role.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-sm text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || selectedRoles.length === 0}
                className={`w-full py-3 rounded-2xl text-sm font-medium transition-colors ${
                  selectedRoles.length > 0 && !loading
                    ? 'bg-brand-dark text-white hover:bg-brand-dark/90 cursor-pointer'
                    : 'bg-black/5 text-brand-dark/70 cursor-not-allowed'
                }`}
              >
                {loading ? 'Saving...' : 'Continue to Portal'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
