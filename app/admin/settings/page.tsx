'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type LinkItem = { title: string; href: string };

type CompanySettings = {
  companyName: string;
  license: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  heroImage: string;
  heroTagline: string;
  legalLinks: LinkItem[];
  quickLinks: LinkItem[];
  resourceLinks: LinkItem[];
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings/company')
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => {
        setMessage({ type: 'error', text: 'Failed to load settings' });
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: string) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const updateAddress = (field: string, value: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      address: { ...settings.address, [field]: value },
    });
  };

  const updateLink = (
    category: 'legalLinks' | 'quickLinks' | 'resourceLinks',
    index: number,
    field: 'title' | 'href',
    value: string
  ) => {
    if (!settings) return;
    const links = [...settings[category]];
    links[index] = { ...links[index], [field]: value };
    setSettings({ ...settings, [category]: links });
  };

  const addLink = (category: 'legalLinks' | 'quickLinks' | 'resourceLinks') => {
    if (!settings) return;
    setSettings({
      ...settings,
      [category]: [...settings[category], { title: '', href: '' }],
    });
  };

  const removeLink = (category: 'legalLinks' | 'quickLinks' | 'resourceLinks', index: number) => {
    if (!settings) return;
    const links = settings[category].filter((_, i) => i !== index);
    setSettings({ ...settings, [category]: links });
  };

  if (loading) {
    return (
      <div className="p-6">
        <p>Loading settings...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6">
        <p className="text-red-600">Failed to load settings</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Company Settings</h1>
        <Link href="/admin" className="text-sm text-gray-600 hover:underline">
          ← Back to Admin
        </Link>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-8">
        {/* Company Info */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-medium mb-4">Company Information</h2>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
                <input
                  type="text"
                  value={settings.license}
                  onChange={(e) => updateField('license', e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={settings.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Address */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-medium mb-4">Address</h2>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
              <input
                type="text"
                value={settings.address.street}
                onChange={(e) => updateAddress('street', e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={settings.address.city}
                  onChange={(e) => updateAddress('city', e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input
                  type="text"
                  value={settings.address.state}
                  onChange={(e) => updateAddress('state', e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                <input
                  type="text"
                  value={settings.address.zip}
                  onChange={(e) => updateAddress('zip', e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Hero Section */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-medium mb-4">Hero Section</h2>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hero Image Path</label>
              <input
                type="text"
                value={settings.heroImage || ''}
                onChange={(e) => updateField('heroImage', e.target.value)}
                placeholder="/images/hero.jpg"
                className="w-full border rounded px-3 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                Upload images to public/images/ folder, then enter the path here (e.g., /images/hero.jpg)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hero Tagline</label>
              <input
                type="text"
                value={settings.heroTagline || ''}
                onChange={(e) => updateField('heroTagline', e.target.value)}
                placeholder="One Search. Every Space. Home. Business."
                className="w-full border rounded px-3 py-2"
              />
            </div>
            {settings.heroImage && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preview</label>
                <div className="relative w-full h-40 bg-gray-100 rounded overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.heroImage}
                    alt="Hero preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Legal Links */}
        <section className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Legal Links</h2>
            <button
              onClick={() => addLink('legalLinks')}
              className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
            >
              + Add Link
            </button>
          </div>
          <div className="space-y-3">
            {settings.legalLinks.map((link, index) => (
              <div key={index} className="flex gap-3 items-center">
                <input
                  type="text"
                  value={link.title}
                  onChange={(e) => updateLink('legalLinks', index, 'title', e.target.value)}
                  placeholder="Title"
                  className="flex-1 border rounded px-3 py-2"
                />
                <input
                  type="text"
                  value={link.href}
                  onChange={(e) => updateLink('legalLinks', index, 'href', e.target.value)}
                  placeholder="/path"
                  className="flex-1 border rounded px-3 py-2"
                />
                <button
                  onClick={() => removeLink('legalLinks', index)}
                  className="text-red-600 hover:text-red-800 px-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Links */}
        <section className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Quick Links</h2>
            <button
              onClick={() => addLink('quickLinks')}
              className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
            >
              + Add Link
            </button>
          </div>
          <div className="space-y-3">
            {settings.quickLinks.map((link, index) => (
              <div key={index} className="flex gap-3 items-center">
                <input
                  type="text"
                  value={link.title}
                  onChange={(e) => updateLink('quickLinks', index, 'title', e.target.value)}
                  placeholder="Title"
                  className="flex-1 border rounded px-3 py-2"
                />
                <input
                  type="text"
                  value={link.href}
                  onChange={(e) => updateLink('quickLinks', index, 'href', e.target.value)}
                  placeholder="/path"
                  className="flex-1 border rounded px-3 py-2"
                />
                <button
                  onClick={() => removeLink('quickLinks', index)}
                  className="text-red-600 hover:text-red-800 px-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Resource Links */}
        <section className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Resource Links</h2>
            <button
              onClick={() => addLink('resourceLinks')}
              className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
            >
              + Add Link
            </button>
          </div>
          <div className="space-y-3">
            {settings.resourceLinks.map((link, index) => (
              <div key={index} className="flex gap-3 items-center">
                <input
                  type="text"
                  value={link.title}
                  onChange={(e) => updateLink('resourceLinks', index, 'title', e.target.value)}
                  placeholder="Title"
                  className="flex-1 border rounded px-3 py-2"
                />
                <input
                  type="text"
                  value={link.href}
                  onChange={(e) => updateLink('resourceLinks', index, 'href', e.target.value)}
                  placeholder="/path"
                  className="flex-1 border rounded px-3 py-2"
                />
                <button
                  onClick={() => removeLink('resourceLinks', index)}
                  className="text-red-600 hover:text-red-800 px-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
