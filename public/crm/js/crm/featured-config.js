/**
 * Featured Config — CRM Module
 * Broker controls which listings appear on the homepage Featured section.
 */
/* global MallanAPI, showToast */

const FeaturedCfg = {
  config: null,
  previewListings: [],
};

const FC_BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];
const FC_SORT_OPTIONS = [
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'newest', label: 'Newest First' },
];

async function initFeaturedConfig() {
  const c = document.getElementById('featured-config');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;">Loading featured config...</div>';
  try {
    await loadFeaturedConfig();
    renderFeaturedConfig();
  } catch {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load featured config.</div>';
  }
}

async function loadFeaturedConfig() {
  const res = await MallanAPI._fetch('/api/crm/featured-config');
  if (res.ok !== false) {
    FeaturedCfg.config = res;
  } else {
    FeaturedCfg.config = {
      pinned_ids: [],
      filters: { type: 'sale', boroughs: ['Manhattan'], neighborhoods: [], minPrice: 500000, maxPrice: 0, minBeds: 1 },
      sort: 'newest',
      display_limit: 6,
      is_active: true,
    };
  }
}

function renderFeaturedConfig() {
  const c = document.getElementById('featured-config');
  if (!c) return;
  const cfg = FeaturedCfg.config;
  const filters = cfg.filters || {};
  const boroughs = filters.boroughs || [];
  const pinned = (cfg.pinned_ids || []).join('\n');

  c.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Featured Properties</h2>
          <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Control which listings appear on the homepage</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="previewFeatured()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
            <i class="fas fa-eye" style="margin-right:4px;"></i> Preview
          </button>
          <button onclick="saveFeaturedConfig()" style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
            <i class="fas fa-save" style="margin-right:4px;"></i> Save
          </button>
        </div>
      </div>
    </div>

    <div style="padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
      <!-- Left: Filters -->
      <div>
        <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
          <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 16px;">Filters</h3>

          <!-- Type Toggle -->
          <div style="margin-bottom:16px;">
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Listing Type</label>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <button id="fc-type-sale" onclick="fcSetType('sale')" style="flex:1;padding:8px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:2px solid ${filters.type === 'sale' ? '#2563eb' : '#e2e8f0'};background:${filters.type === 'sale' ? '#eff6ff' : 'white'};color:${filters.type === 'sale' ? '#2563eb' : '#374151'};">For Sale</button>
              <button id="fc-type-rent" onclick="fcSetType('rent')" style="flex:1;padding:8px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:2px solid ${filters.type === 'rent' ? '#2563eb' : '#e2e8f0'};background:${filters.type === 'rent' ? '#eff6ff' : 'white'};color:${filters.type === 'rent' ? '#2563eb' : '#374151'};">For Rent</button>
            </div>
          </div>

          <!-- Boroughs -->
          <div style="margin-bottom:16px;">
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Boroughs</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
              ${FC_BOROUGHS.map(b => `
                <label style="display:flex;align-items:center;gap:4px;font-size:13px;color:#374151;cursor:pointer;">
                  <input type="checkbox" class="fc-borough" value="${b}" ${boroughs.includes(b) ? 'checked' : ''} style="accent-color:#2563eb;"> ${b}
                </label>
              `).join('')}
            </div>
          </div>

          <!-- Neighborhoods -->
          <div style="margin-bottom:16px;">
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Neighborhoods (comma-separated, optional)</label>
            <input id="fc-neighborhoods" type="text" value="${(filters.neighborhoods || []).join(', ')}" placeholder="e.g. Upper East Side, Tribeca" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:6px;box-sizing:border-box;">
          </div>

          <!-- Price Range -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <div>
              <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Min Price</label>
              <input id="fc-min-price" type="number" value="${filters.minPrice || ''}" placeholder="0" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:6px;box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Max Price</label>
              <input id="fc-max-price" type="number" value="${filters.maxPrice || ''}" placeholder="No max" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:6px;box-sizing:border-box;">
            </div>
          </div>

          <!-- Min Beds -->
          <div style="margin-bottom:16px;">
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Min Bedrooms</label>
            <select id="fc-min-beds" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:6px;">
              <option value="0" ${(filters.minBeds || 0) === 0 ? 'selected' : ''}>Studio+</option>
              <option value="1" ${filters.minBeds === 1 ? 'selected' : ''}>1+</option>
              <option value="2" ${filters.minBeds === 2 ? 'selected' : ''}>2+</option>
              <option value="3" ${filters.minBeds === 3 ? 'selected' : ''}>3+</option>
              <option value="4" ${filters.minBeds === 4 ? 'selected' : ''}>4+</option>
            </select>
          </div>

          <!-- Sort -->
          <div style="margin-bottom:16px;">
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Sort Order</label>
            <select id="fc-sort" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:6px;">
              ${FC_SORT_OPTIONS.map(o => `<option value="${o.value}" ${cfg.sort === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>

          <!-- Display Limit -->
          <div>
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Number of Listings</label>
            <select id="fc-limit" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:6px;">
              ${[3,6,9,12].map(n => `<option value="${n}" ${cfg.display_limit === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Right: Pinned Exclusives -->
      <div>
        <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
          <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 4px;">Pinned Exclusives</h3>
          <p style="font-size:12px;color:#6b7280;margin:0 0 16px;">These listings always appear first with an "Exclusive" badge. Enter one MLS ID or listing ID per line.</p>
          <textarea id="fc-pinned" rows="8" placeholder="e.g.&#10;RLS20071059&#10;RLS20065432" style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-family:monospace;box-sizing:border-box;resize:vertical;">${pinned}</textarea>
        </div>

        <!-- Preview Area -->
        <div id="fc-preview" style="margin-top:16px;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;display:none;">
          <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 12px;">Preview</h3>
          <div id="fc-preview-list" style="font-size:13px;color:#374151;"></div>
        </div>

        ${cfg.updated_at ? `<p style="margin-top:12px;font-size:11px;color:#9ca3af;">Last saved: ${new Date(cfg.updated_at).toLocaleString()}</p>` : ''}
      </div>
    </div>
  `;
}

function fcSetType(type) {
  if (!FeaturedCfg.config) return;
  FeaturedCfg.config.filters = FeaturedCfg.config.filters || {};
  FeaturedCfg.config.filters.type = type;
  renderFeaturedConfig();
}

function fcCollectForm() {
  const boroughs = Array.from(document.querySelectorAll('.fc-borough:checked')).map(el => el.value);
  const rawNeighborhoods = (document.getElementById('fc-neighborhoods')?.value || '').trim();
  const neighborhoods = rawNeighborhoods ? rawNeighborhoods.split(',').map(s => s.trim()).filter(Boolean) : [];
  const minPrice = parseInt(document.getElementById('fc-min-price')?.value) || 0;
  const maxPrice = parseInt(document.getElementById('fc-max-price')?.value) || 0;
  const minBeds = parseInt(document.getElementById('fc-min-beds')?.value) || 0;
  const sort = document.getElementById('fc-sort')?.value || 'price-desc';
  const displayLimit = parseInt(document.getElementById('fc-limit')?.value) || 6;
  const pinnedRaw = (document.getElementById('fc-pinned')?.value || '').trim();
  const pinnedIds = pinnedRaw ? pinnedRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const type = FeaturedCfg.config?.filters?.type || 'sale';

  return {
    pinned_ids: pinnedIds,
    filters: { type, boroughs, neighborhoods, minPrice, maxPrice, minBeds },
    sort,
    display_limit: displayLimit,
    is_active: true,
  };
}

async function saveFeaturedConfig() {
  const data = fcCollectForm();
  try {
    const res = await MallanAPI._fetch('/api/crm/featured-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    FeaturedCfg.config = res;
    renderFeaturedConfig();
    showToast('Featured config saved. Changes go live within 5 minutes.', 'success');
  } catch {
    showToast('Failed to save featured config.', 'error');
  }
}

async function previewFeatured() {
  const data = fcCollectForm();
  const params = new URLSearchParams();
  params.set('type', data.filters.type === 'rent' ? 'rent' : 'sale');
  params.set('limit', String(Math.max(data.display_limit * 3, 30)));
  params.set('sort', data.sort);
  if (data.filters.minPrice) params.set('minPrice', String(data.filters.minPrice));
  if (data.filters.maxPrice) params.set('maxPrice', String(data.filters.maxPrice));
  if (data.filters.minBeds) params.set('beds', String(data.filters.minBeds));
  if (data.filters.boroughs.length === 1) params.set('borough', data.filters.boroughs[0]);

  const previewDiv = document.getElementById('fc-preview');
  const listDiv = document.getElementById('fc-preview-list');
  if (!previewDiv || !listDiv) return;
  previewDiv.style.display = 'block';
  listDiv.innerHTML = '<div style="color:#6b7280;">Loading preview...</div>';

  try {
    const res = await MallanAPI._fetch('/api/listings?' + params.toString());
    const listings = res.listings || [];
    const pinnedSet = new Set(data.pinned_ids);

    const pinned = listings.filter(l => pinnedSet.has(l.id) || pinnedSet.has(l.mlsId));
    const rest = listings.filter(l => !pinnedSet.has(l.id) && !pinnedSet.has(l.mlsId));
    const featured = [...pinned, ...rest].slice(0, data.display_limit);

    if (featured.length === 0) {
      listDiv.innerHTML = '<div style="color:#f59e0b;">No listings match these filters.</div>';
      return;
    }

    listDiv.innerHTML = featured.map((l, i) => {
      const addr = l.address ? `${l.address.streetNumber || ''} ${l.address.streetName || ''}`.trim() : l.id;
      const isPinned = pinnedSet.has(l.id) || pinnedSet.has(l.mlsId);
      const price = l.listPrice ? '$' + l.listPrice.toLocaleString() : '';
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;${i > 0 ? 'border-top:1px solid #f3f4f6;' : ''}">
        <span style="width:24px;text-align:center;font-weight:600;color:#9ca3af;">${i + 1}</span>
        ${isPinned ? '<span style="background:#B8860B;color:white;font-size:10px;padding:2px 6px;border-radius:9999px;font-weight:600;">PINNED</span>' : ''}
        <span style="flex:1;">${addr}</span>
        <span style="font-weight:600;">${price}</span>
        <span style="color:#6b7280;font-size:12px;">${l.mlsId || l.id}</span>
      </div>`;
    }).join('');
  } catch {
    listDiv.innerHTML = '<div style="color:#dc2626;">Preview failed.</div>';
  }
}

// Export for CRM
window.initFeaturedConfig = initFeaturedConfig;
window.fcSetType = fcSetType;
window.saveFeaturedConfig = saveFeaturedConfig;
window.previewFeatured = previewFeatured;
