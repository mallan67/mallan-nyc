/**
 * Lifestyle Match Engine (#9) — CRM Module
 * Score listings against lifestyle preferences.
 * Uses transit data already embedded in forms + neighborhood context.
 */
/* global MallanAPI, showToast */

var LIFESTYLE_FACTORS = [
  { id: 'transit', label: 'Public Transit', icon: 'fa-subway', weight: 1 },
  { id: 'parks', label: 'Parks & Green Space', icon: 'fa-tree', weight: 1 },
  { id: 'dining', label: 'Restaurants & Nightlife', icon: 'fa-utensils', weight: 1 },
  { id: 'walkability', label: 'Walkability & Errands', icon: 'fa-walking', weight: 1 },
  { id: 'shopping', label: 'Shopping & Retail', icon: 'fa-shopping-bag', weight: 1 },
  { id: 'fitness', label: 'Gyms & Fitness', icon: 'fa-dumbbell', weight: 1 },
  { id: 'culture', label: 'Arts & Culture', icon: 'fa-theater-masks', weight: 1 },
  { id: 'lowdensity', label: 'Lower Density', icon: 'fa-moon', weight: 1 }
];

// NYC neighborhood lifestyle profiles (curated data)
var NEIGHBORHOOD_PROFILES = {
  'Upper East Side': { transit: 90, parks: 95, dining: 80, walkability: 90, shopping: 85, fitness: 85, culture: 95, lowdensity: 70 },
  'Upper West Side': { transit: 90, parks: 95, dining: 75, walkability: 90, shopping: 80, fitness: 80, culture: 90, lowdensity: 75 },
  'Tribeca': { transit: 80, parks: 70, dining: 95, walkability: 70, shopping: 85, fitness: 80, culture: 85, lowdensity: 60 },
  'SoHo': { transit: 85, parks: 50, dining: 95, walkability: 40, shopping: 95, fitness: 75, culture: 90, lowdensity: 30 },
  'Chelsea': { transit: 90, parks: 80, dining: 90, walkability: 55, shopping: 90, fitness: 90, culture: 95, lowdensity: 45 },
  'West Village': { transit: 85, parks: 70, dining: 95, walkability: 50, shopping: 80, fitness: 70, culture: 85, lowdensity: 55 },
  'East Village': { transit: 85, parks: 65, dining: 95, walkability: 40, shopping: 75, fitness: 70, culture: 90, lowdensity: 35 },
  'Gramercy': { transit: 85, parks: 85, dining: 80, walkability: 65, shopping: 75, fitness: 80, culture: 70, lowdensity: 70 },
  'Midtown': { transit: 95, parks: 60, dining: 85, walkability: 30, shopping: 95, fitness: 85, culture: 90, lowdensity: 15 },
  'Financial District': { transit: 90, parks: 70, dining: 75, walkability: 45, shopping: 70, fitness: 75, culture: 60, lowdensity: 40 },
  'Williamsburg': { transit: 75, parks: 70, dining: 90, walkability: 55, shopping: 80, fitness: 80, culture: 85, lowdensity: 45 },
  'DUMBO': { transit: 70, parks: 80, dining: 80, walkability: 50, shopping: 65, fitness: 70, culture: 80, lowdensity: 55 },
  'Park Slope': { transit: 80, parks: 95, dining: 80, walkability: 90, shopping: 75, fitness: 75, culture: 70, lowdensity: 75 },
  'Brooklyn Heights': { transit: 85, parks: 85, dining: 75, walkability: 85, shopping: 65, fitness: 65, culture: 70, lowdensity: 80 },
  'Long Island City': { transit: 85, parks: 75, dining: 70, walkability: 50, shopping: 60, fitness: 75, culture: 65, lowdensity: 50 },
  'Astoria': { transit: 80, parks: 70, dining: 85, walkability: 65, shopping: 70, fitness: 70, culture: 65, lowdensity: 60 },
  'Harlem': { transit: 85, parks: 75, dining: 75, walkability: 60, shopping: 65, fitness: 65, culture: 80, lowdensity: 55 },
  'Murray Hill': { transit: 90, parks: 50, dining: 80, walkability: 45, shopping: 80, fitness: 80, culture: 60, lowdensity: 50 },
  'Flatiron': { transit: 90, parks: 75, dining: 90, walkability: 40, shopping: 90, fitness: 85, culture: 80, lowdensity: 35 },
  'Battery Park City': { transit: 75, parks: 95, dining: 65, walkability: 75, shopping: 55, fitness: 70, culture: 55, lowdensity: 80 }
};

async function initLifestyleMatch() {
  var c = document.getElementById('lifestyle-match');
  if (!c) return;

  var factorSliders = LIFESTYLE_FACTORS.map(function(f) {
    return '<div style="margin-bottom:12px;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
        '<label style="font-size:12px;font-weight:600;color:#374151;"><i class="fas ' + f.icon + '" style="margin-right:4px;color:#6b7280;"></i>' + f.label + '</label>' +
        '<span id="lm-val-' + f.id + '" style="font-size:12px;color:#6b7280;">5</span>' +
      '</div>' +
      '<input type="range" id="lm-' + f.id + '" min="0" max="10" value="5" style="width:100%;accent-color:#2563eb;" oninput="document.getElementById(\'lm-val-' + f.id + '\').textContent=this.value">' +
    '</div>';
  }).join('');

  c.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Lifestyle Match Engine</h2>
      <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Score neighborhoods based on lifestyle preferences — find the perfect fit</p>
    </div>
    <div style="padding:24px;display:grid;grid-template-columns:300px 1fr;gap:24px;">
      <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
        <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 16px;">Preferences (0 = don't care, 10 = must have)</h3>
        ${factorSliders}
        <button onclick="runLifestyleMatch()" style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;">
          <i class="fas fa-magic" style="margin-right:6px;"></i> Find Matches
        </button>
      </div>
      <div id="lm-results">
        <div style="text-align:center;padding:60px 20px;color:#9ca3af;">
          <i class="fas fa-map-marker-alt" style="font-size:48px;margin-bottom:12px;display:block;"></i>
          <p style="font-size:14px;">Adjust sliders and click Find Matches</p>
        </div>
      </div>
    </div>
  `;
}

function runLifestyleMatch() {
  var result = document.getElementById('lm-results');
  if (!result) return;

  // Collect preferences
  var prefs = {};
  var totalWeight = 0;
  LIFESTYLE_FACTORS.forEach(function(f) {
    var val = parseInt(document.getElementById('lm-' + f.id)?.value) || 0;
    prefs[f.id] = val;
    totalWeight += val;
  });

  if (totalWeight === 0) { showToast('Set at least one preference above 0', 'error'); return; }

  // Score each neighborhood
  var scores = Object.entries(NEIGHBORHOOD_PROFILES).map(function(e) {
    var nh = e[0];
    var profile = e[1];
    var weightedScore = 0;
    var maxPossible = 0;

    LIFESTYLE_FACTORS.forEach(function(f) {
      var pref = prefs[f.id] || 0;
      if (pref > 0) {
        weightedScore += (profile[f.id] || 0) * pref;
        maxPossible += 100 * pref;
      }
    });

    var fitPct = maxPossible > 0 ? Math.round((weightedScore / maxPossible) * 100) : 0;

    // Per-factor breakdown
    var factors = LIFESTYLE_FACTORS.filter(function(f) { return prefs[f.id] > 0; }).map(function(f) {
      return { id: f.id, label: f.label, icon: f.icon, preference: prefs[f.id], score: profile[f.id] || 0 };
    });

    return { neighborhood: nh, fit: fitPct, factors: factors };
  }).sort(function(a, b) { return b.fit - a.fit; });

  var cards = scores.map(function(s, i) {
    var fitColor = s.fit >= 85 ? '#059669' : s.fit >= 70 ? '#3b82f6' : s.fit >= 55 ? '#f59e0b' : '#ef4444';
    var medal = i === 0 ? '<span style="font-size:16px;">🥇</span>' : i === 1 ? '<span style="font-size:16px;">🥈</span>' : i === 2 ? '<span style="font-size:16px;">🥉</span>' : '<span style="font-size:14px;color:#9ca3af;">#' + (i + 1) + '</span>';

    var factorBars = s.factors.slice(0, 5).map(function(f) {
      var barColor = f.score >= 80 ? '#059669' : f.score >= 60 ? '#3b82f6' : f.score >= 40 ? '#f59e0b' : '#ef4444';
      return '<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:3px;">' +
        '<span style="width:80px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i class="fas ' + f.icon + '" style="width:12px;text-align:center;margin-right:2px;"></i>' + f.label + '</span>' +
        '<div style="flex:1;background:#f3f4f6;border-radius:9999px;height:4px;overflow:hidden;">' +
          '<div style="background:' + barColor + ';height:100%;width:' + f.score + '%;"></div>' +
        '</div>' +
        '<span style="width:24px;text-align:right;font-weight:600;color:' + barColor + ';">' + f.score + '</span>' +
      '</div>';
    }).join('');

    return '<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' + medal +
          '<span style="font-size:14px;font-weight:700;color:#111827;">' + s.neighborhood + '</span>' +
        '</div>' +
        '<div style="width:48px;height:48px;border-radius:50%;border:3px solid ' + fitColor + ';display:flex;align-items:center;justify-content:center;">' +
          '<span style="font-size:14px;font-weight:800;color:' + fitColor + ';">' + s.fit + '%</span>' +
        '</div>' +
      '</div>' +
      factorBars +
    '</div>';
  }).join('');

  result.innerHTML = `
    <div style="margin-bottom:12px;">
      <h3 style="font-size:16px;font-weight:700;color:#111827;margin:0;">Best Matches</h3>
      <p style="font-size:12px;color:#6b7280;margin:4px 0 0;">${scores.length} neighborhoods ranked by lifestyle fit</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
      ${cards}
    </div>
    <div style="margin-top:16px;background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px;">
      <p style="font-size:11px;color:#92400e;margin:0;"><i class="fas fa-exclamation-triangle" style="margin-right:4px;"></i><strong>Fair Housing Notice:</strong> This tool provides amenity-based neighborhood data only. It must not be used to direct buyers toward or away from any neighborhood based on race, color, religion, sex, national origin, familial status, disability, age, or any other protected characteristic under the Fair Housing Act, NYC Human Rights Law, or REBNY RLS rules. All neighborhood decisions must be buyer-directed.</p>
    </div>
  `;
}

window.initLifestyleMatch = initLifestyleMatch;
window.runLifestyleMatch = runLifestyleMatch;
