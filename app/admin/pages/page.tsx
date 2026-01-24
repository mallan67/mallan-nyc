'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface PageData {
  slug: string;
  title: string;
  lastUpdated?: string;
  content?: string;
  // About Us specific fields
  mission?: { title: string; content: string };
  story?: { title: string; content: string };
  values?: Array<{ title: string; description: string }>;
  stats?: Array<{ value: string; label: string }>;
}

const PAGE_SLUGS = [
  { slug: 'about-us', label: 'About Us', type: 'about' },
  { slug: 'fair-housing', label: 'Fair Housing', type: 'legal' },
  { slug: 'privacy', label: 'Privacy Policy', type: 'legal' },
  { slug: 'terms', label: 'Terms of Service', type: 'legal' },
  { slug: 'sop', label: 'Standardized Operating Procedures', type: 'legal' },
  { slug: 'reasonable-accommodations', label: 'Reasonable Accommodations', type: 'legal' },
];

export default function AdminPagesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingPage, setEditingPage] = useState<PageData | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);

  useEffect(() => {
    loadPages();
  }, []);

  const loadPages = async () => {
    const loadedPages: PageData[] = [];
    for (const page of PAGE_SLUGS) {
      try {
        const res = await fetch(`/api/pages/${page.slug}`);
        if (res.ok) {
          const data = await res.json();
          loadedPages.push({ ...data, slug: page.slug });
        }
      } catch {
        // Page doesn't exist yet
      }
    }
    setPages(loadedPages);
    setLoading(false);
  };

  const editPage = async (slug: string) => {
    const res = await fetch(`/api/pages/${slug}`);
    if (res.ok) {
      const data = await res.json();
      setEditingPage(data);
      setEditingSlug(slug);
    } else {
      // Initialize new page
      const pageInfo = PAGE_SLUGS.find(p => p.slug === slug);
      if (pageInfo?.type === 'about') {
        setEditingPage({
          slug,
          title: 'About Us',
          mission: { title: 'Our Mission', content: '' },
          story: { title: 'Our Story', content: '' },
          values: [],
          stats: [],
        });
      } else {
        setEditingPage({
          slug,
          title: pageInfo?.label || '',
          lastUpdated: new Date().toISOString().split('T')[0],
          content: '',
        });
      }
      setEditingSlug(slug);
    }
  };

  const savePage = async () => {
    if (!editingPage || !editingSlug) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pages/${editingSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPage),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Page saved successfully!' });
        setTimeout(() => setMessage(null), 3000);
        loadPages();
        setEditingPage(null);
        setEditingSlug(null);
      } else {
        throw new Error('Failed to save');
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save page.' });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const pageInfo = editingSlug ? PAGE_SLUGS.find(p => p.slug === editingSlug) : null;
  const isAboutPage = pageInfo?.type === 'about';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin" className="text-gray-600 hover:text-black">
          &larr; Back
        </Link>
        <h1 className="text-2xl font-semibold">Pages</h1>
      </div>

      {message && (
        <div
          className={`mb-4 p-4 rounded ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Editor Modal */}
      {editingPage && editingSlug && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-semibold mb-6">Edit: {pageInfo?.label}</h2>

            {isAboutPage ? (
              // About Us Editor
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-1">Page Title</label>
                  <input
                    type="text"
                    value={editingPage.title || ''}
                    onChange={e => setEditingPage({ ...editingPage, title: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Mission Section</h3>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editingPage.mission?.title || ''}
                      onChange={e =>
                        setEditingPage({
                          ...editingPage,
                          mission: { ...editingPage.mission!, title: e.target.value },
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="Section title"
                    />
                    <textarea
                      value={editingPage.mission?.content || ''}
                      onChange={e =>
                        setEditingPage({
                          ...editingPage,
                          mission: { ...editingPage.mission!, content: e.target.value },
                        })
                      }
                      className="w-full border rounded px-3 py-2 h-24"
                      placeholder="Mission content..."
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Story Section</h3>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editingPage.story?.title || ''}
                      onChange={e =>
                        setEditingPage({
                          ...editingPage,
                          story: { ...editingPage.story!, title: e.target.value },
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                      placeholder="Section title"
                    />
                    <textarea
                      value={editingPage.story?.content || ''}
                      onChange={e =>
                        setEditingPage({
                          ...editingPage,
                          story: { ...editingPage.story!, content: e.target.value },
                        })
                      }
                      className="w-full border rounded px-3 py-2 h-32"
                      placeholder="Story content (use double line breaks for paragraphs)..."
                    />
                  </div>
                </div>
              </div>
            ) : (
              // Legal Page Editor
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Page Title</label>
                  <input
                    type="text"
                    value={editingPage.title || ''}
                    onChange={e => setEditingPage({ ...editingPage, title: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Last Updated</label>
                  <input
                    type="date"
                    value={editingPage.lastUpdated || ''}
                    onChange={e => setEditingPage({ ...editingPage, lastUpdated: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Content (Markdown supported)</label>
                  <textarea
                    value={editingPage.content || ''}
                    onChange={e => setEditingPage({ ...editingPage, content: e.target.value })}
                    className="w-full border rounded px-3 py-2 h-96 font-mono text-sm"
                    placeholder="## Heading&#10;&#10;Content here...&#10;&#10;- List item&#10;- Another item"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use ## for headings, ### for subheadings, **bold**, - for lists
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => {
                  setEditingPage(null);
                  setEditingSlug(null);
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={savePage}
                disabled={saving}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Page'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pages List */}
      <div className="space-y-6">
        {/* About Us */}
        <div>
          <h2 className="text-lg font-medium text-gray-700 mb-3">About</h2>
          <div className="bg-white border rounded-lg divide-y">
            {PAGE_SLUGS.filter(p => p.type === 'about').map(page => {
              const _pageData = pages.find(p => p.slug === page.slug);
              return (
                <div key={page.slug} className="p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{page.label}</h3>
                    <p className="text-sm text-gray-500">/{page.slug.replace('-', '/')}</p>
                  </div>
                  <div className="flex gap-3">
                    <Link
                      href={`/${page.slug.replace('-', '/')}`}
                      className="text-sm text-gray-600 hover:underline"
                      target="_blank"
                    >
                      Preview
                    </Link>
                    <button
                      onClick={() => editPage(page.slug)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legal Pages */}
        <div>
          <h2 className="text-lg font-medium text-gray-700 mb-3">Legal Pages</h2>
          <div className="bg-white border rounded-lg divide-y">
            {PAGE_SLUGS.filter(p => p.type === 'legal').map(page => {
              const _pageData = pages.find(p => p.slug === page.slug);
              return (
                <div key={page.slug} className="p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{page.label}</h3>
                    <p className="text-sm text-gray-500">/{page.slug}</p>
                  </div>
                  <div className="flex gap-3">
                    <Link
                      href={`/${page.slug}`}
                      className="text-sm text-gray-600 hover:underline"
                      target="_blank"
                    >
                      Preview
                    </Link>
                    <button
                      onClick={() => editPage(page.slug)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
