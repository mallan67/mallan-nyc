'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface OpenHouse {
  id: string;
  address: string;
  neighborhood: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  type: string;
  agentName: string;
  agentPhone: string;
  description: string;
  image: string;
  featured: boolean;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

export default function AdminOpenHousesPage() {
  const [openHouses, setOpenHouses] = useState<OpenHouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingOH, setEditingOH] = useState<OpenHouse | null>(null);

  useEffect(() => {
    fetchOpenHouses();
  }, []);

  const fetchOpenHouses = () => {
    fetch('/api/open-houses')
      .then(res => res.json())
      .then(data => {
        setOpenHouses(data.openHouses || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const saveOpenHouses = async (updated: OpenHouse[]) => {
    setSaving(true);
    try {
      const res = await fetch('/api/open-houses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openHouses: updated }),
      });
      if (res.ok) {
        setOpenHouses(updated);
        setMessage({ type: 'success', text: 'Changes saved successfully!' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error('Failed to save');
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save changes.' });
    }
    setSaving(false);
  };

  const addOpenHouse = () => {
    const newOH: OpenHouse = {
      id: Date.now().toString(),
      address: '',
      neighborhood: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '12:00 PM',
      endTime: '2:00 PM',
      price: 0,
      beds: 1,
      baths: 1,
      sqft: 0,
      type: 'Condo',
      agentName: '',
      agentPhone: '',
      description: '',
      image: '/images/listing-placeholder.svg',
      featured: false,
    };
    setEditingOH(newOH);
  };

  const editOpenHouse = (oh: OpenHouse) => {
    setEditingOH({ ...oh });
  };

  const deleteOpenHouse = (id: string) => {
    if (confirm('Are you sure you want to delete this open house?')) {
      const updated = openHouses.filter(oh => oh.id !== id);
      saveOpenHouses(updated);
    }
  };

  const saveEditingOH = () => {
    if (!editingOH) return;
    if (!editingOH.address.trim()) {
      setMessage({ type: 'error', text: 'Address is required.' });
      return;
    }

    const exists = openHouses.find(oh => oh.id === editingOH.id);
    let updated: OpenHouse[];
    if (exists) {
      updated = openHouses.map(oh => (oh.id === editingOH.id ? editingOH : oh));
    } else {
      updated = [...openHouses, editingOH];
    }
    saveOpenHouses(updated);
    setEditingOH(null);
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-gray-600 hover:text-black">
            &larr; Back
          </Link>
          <h1 className="text-2xl font-semibold">Open Houses</h1>
        </div>
        <button
          onClick={addOpenHouse}
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
        >
          Add Open House
        </button>
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
      {editingOH && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-semibold mb-6">
              {openHouses.find(oh => oh.id === editingOH.id) ? 'Edit Open House' : 'Add Open House'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Address *</label>
                <input
                  type="text"
                  value={editingOH.address}
                  onChange={e => setEditingOH({ ...editingOH, address: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="123 Main St, Apt 4B"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Neighborhood</label>
                  <input
                    type="text"
                    value={editingOH.neighborhood}
                    onChange={e => setEditingOH({ ...editingOH, neighborhood: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Upper East Side"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    value={editingOH.type}
                    onChange={e => setEditingOH({ ...editingOH, type: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="Condo">Condo</option>
                    <option value="Co-op">Co-op</option>
                    <option value="Townhouse">Townhouse</option>
                    <option value="Single Family">Single Family</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input
                    type="date"
                    value={editingOH.date}
                    onChange={e => setEditingOH({ ...editingOH, date: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Start Time</label>
                  <input
                    type="text"
                    value={editingOH.startTime}
                    onChange={e => setEditingOH({ ...editingOH, startTime: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="12:00 PM"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Time</label>
                  <input
                    type="text"
                    value={editingOH.endTime}
                    onChange={e => setEditingOH({ ...editingOH, endTime: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="2:00 PM"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Price</label>
                  <input
                    type="number"
                    value={editingOH.price || ''}
                    onChange={e => setEditingOH({ ...editingOH, price: parseInt(e.target.value) || 0 })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="1000000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Beds</label>
                  <input
                    type="number"
                    value={editingOH.beds}
                    onChange={e => setEditingOH({ ...editingOH, beds: parseInt(e.target.value) || 0 })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Baths</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editingOH.baths}
                    onChange={e => setEditingOH({ ...editingOH, baths: parseFloat(e.target.value) || 0 })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sqft</label>
                  <input
                    type="number"
                    value={editingOH.sqft || ''}
                    onChange={e => setEditingOH({ ...editingOH, sqft: parseInt(e.target.value) || 0 })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Agent Name</label>
                  <input
                    type="text"
                    value={editingOH.agentName}
                    onChange={e => setEditingOH({ ...editingOH, agentName: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Agent Phone</label>
                  <input
                    type="tel"
                    value={editingOH.agentPhone}
                    onChange={e => setEditingOH({ ...editingOH, agentPhone: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="(646) 555-0100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Image URL</label>
                <input
                  type="text"
                  value={editingOH.image}
                  onChange={e => setEditingOH({ ...editingOH, image: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="/images/listing.jpg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={editingOH.description}
                  onChange={e => setEditingOH({ ...editingOH, description: e.target.value })}
                  className="w-full border rounded px-3 py-2 h-20"
                  placeholder="Property description..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="featured"
                  checked={editingOH.featured}
                  onChange={e => setEditingOH({ ...editingOH, featured: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="featured" className="text-sm">Featured (shown first)</label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setEditingOH(null)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEditingOH}
                disabled={saving}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Houses List */}
      {openHouses.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">No open houses scheduled.</p>
          <button onClick={addOpenHouse} className="text-brand-gold hover:underline">
            Add your first open house
          </button>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Property</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Date & Time</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Price</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Agent</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {openHouses
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map(oh => (
                  <tr key={oh.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{oh.address}</div>
                      <div className="text-sm text-gray-500">{oh.neighborhood}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>{oh.date}</div>
                      <div className="text-gray-500">{oh.startTime} - {oh.endTime}</div>
                    </td>
                    <td className="px-4 py-3">{formatPrice(oh.price)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{oh.agentName}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => editOpenHouse(oh)}
                        className="text-sm text-blue-600 hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteOpenHouse(oh.id)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
