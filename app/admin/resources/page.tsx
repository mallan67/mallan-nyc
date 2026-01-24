'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Section {
  title: string;
  content: string;
}

interface Resource {
  slug: string;
  title: string;
  subtitle: string;
  heroImage: string;
  sections: Section[];
  cta: {
    title: string;
    description: string;
    buttonText: string;
    buttonLink: string;
  };
}

export default function AdminResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchResources();
  }, []);

  const fetchResources = () => {
    fetch('/api/resources/all')
      .then(res => res.json())
      .then(data => {
        setResources(data.resources || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const saveResource = async (resource: Resource) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/resources/${resource.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resource),
      });
      if (res.ok) {
        fetchResources();
        setMessage({ type: 'success', text: 'Resource saved successfully!' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error('Failed to save');
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save resource.' });
    }
    setSaving(false);
  };

  const editResource = (resource: Resource) => {
    setEditingResource({ ...resource, sections: resource.sections.map(s => ({ ...s })) });
    setEditingSectionIndex(null);
  };

  const saveEditingResource = () => {
    if (!editingResource) return;
    if (!editingResource.title.trim()) {
      setMessage({ type: 'error', text: 'Title is required.' });
      return;
    }
    saveResource(editingResource);
    setEditingResource(null);
  };

  const addSection = () => {
    if (!editingResource) return;
    setEditingResource({
      ...editingResource,
      sections: [...editingResource.sections, { title: 'New Section', content: '' }],
    });
    setEditingSectionIndex(editingResource.sections.length);
  };

  const removeSection = (index: number) => {
    if (!editingResource) return;
    const sections = editingResource.sections.filter((_, i) => i !== index);
    setEditingResource({ ...editingResource, sections });
    setEditingSectionIndex(null);
  };

  const updateSection = (index: number, field: 'title' | 'content', value: string) => {
    if (!editingResource) return;
    const sections = [...editingResource.sections];
    sections[index] = { ...sections[index], [field]: value };
    setEditingResource({ ...editingResource, sections });
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin" className="text-gray-600 hover:text-black">
          &larr; Back
        </Link>
        <h1 className="text-2xl font-semibold">Resource Guides</h1>
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
      {editingResource && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-semibold mb-6">Edit: {editingResource.title}</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <input
                    type="text"
                    value={editingResource.title}
                    onChange={e => setEditingResource({ ...editingResource, title: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Hero Image URL</label>
                  <input
                    type="text"
                    value={editingResource.heroImage}
                    onChange={e => setEditingResource({ ...editingResource, heroImage: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Subtitle</label>
                <input
                  type="text"
                  value={editingResource.subtitle}
                  onChange={e => setEditingResource({ ...editingResource, subtitle: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              {/* Sections */}
              <div className="border-t pt-4 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Sections</h3>
                  <button
                    onClick={addSection}
                    className="text-sm text-brand-gold hover:underline"
                  >
                    + Add Section
                  </button>
                </div>

                <div className="space-y-2">
                  {editingResource.sections.map((section, index) => (
                    <div
                      key={index}
                      className={`border rounded p-3 ${
                        editingSectionIndex === index ? 'border-brand-gold' : ''
                      }`}
                    >
                      {editingSectionIndex === index ? (
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={section.title}
                            onChange={e => updateSection(index, 'title', e.target.value)}
                            className="w-full border rounded px-3 py-2 font-medium"
                            placeholder="Section title"
                          />
                          <textarea
                            value={section.content}
                            onChange={e => updateSection(index, 'content', e.target.value)}
                            className="w-full border rounded px-3 py-2 h-48 font-mono text-sm"
                            placeholder="Section content (supports markdown: ## headers, **bold**, - lists)"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingSectionIndex(null)}
                              className="text-sm text-gray-600 hover:text-black"
                            >
                              Done
                            </button>
                            <button
                              onClick={() => removeSection(index)}
                              className="text-sm text-red-600 hover:underline"
                            >
                              Remove Section
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setEditingSectionIndex(index)}
                        >
                          <span className="font-medium">{section.title}</span>
                          <span className="text-sm text-gray-400">Click to edit</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium mb-4">Call to Action</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">CTA Title</label>
                    <input
                      type="text"
                      value={editingResource.cta.title}
                      onChange={e =>
                        setEditingResource({
                          ...editingResource,
                          cta: { ...editingResource.cta, title: e.target.value },
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Button Text</label>
                    <input
                      type="text"
                      value={editingResource.cta.buttonText}
                      onChange={e =>
                        setEditingResource({
                          ...editingResource,
                          cta: { ...editingResource.cta, buttonText: e.target.value },
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <input
                      type="text"
                      value={editingResource.cta.description}
                      onChange={e =>
                        setEditingResource({
                          ...editingResource,
                          cta: { ...editingResource.cta, description: e.target.value },
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Button Link</label>
                    <input
                      type="text"
                      value={editingResource.cta.buttonLink}
                      onChange={e =>
                        setEditingResource({
                          ...editingResource,
                          cta: { ...editingResource.cta, buttonLink: e.target.value },
                        })
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setEditingResource(null)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEditingResource}
                disabled={saving}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resources List */}
      {resources.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No resource guides found.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {resources.map(resource => (
            <div
              key={resource.slug}
              className="bg-white border rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{resource.title}</h3>
                  <p className="text-gray-600 text-sm">{resource.subtitle}</p>
                  <p className="text-gray-400 text-xs mt-1">
                    {resource.sections.length} sections &bull; /resources/{resource.slug}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Link
                    href={`/resources/${resource.slug}`}
                    className="text-sm text-gray-600 hover:underline"
                    target="_blank"
                  >
                    Preview
                  </Link>
                  <button
                    onClick={() => editResource(resource)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
