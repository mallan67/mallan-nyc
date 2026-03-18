// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT NORMALIZER — Single canonical client model transform
// Used by: dashboard (panels.js, workspace.js) AND search (client-database.js)
// ═══════════════════════════════════════════════════════════════════════════════

var ClientNormalizer = (function () {
  'use strict';

  /**
   * Normalize a client object from the API into a consistent shape.
   * Mutates the original object (adds derived fields) and returns it.
   *
   * Guaranteed fields after normalization:
   *   .name           — "John Smith" (from first_name + last_name, or email)
   *   .type           — "buyer" | "seller" | "renter" | "landlord"
   *   .client_type    — alias of .type
   *   ._displayName   — "John & Jane Smith" for couples, or .name
   */
  function normalize(cl) {
    if (!cl) return cl;

    // Name from first_name + last_name
    if (!cl.name && (cl.first_name || cl.last_name)) {
      cl.name = ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim();
    }

    // Type from portal_role or roles array
    if (!cl.type && !cl.client_type) {
      cl.type = cl.portal_role || (cl.roles && cl.roles[0]) || 'buyer';
      cl.client_type = cl.type;
    }
    if (!cl.client_type) cl.client_type = cl.type;
    if (!cl.type) cl.type = cl.client_type;

    // Display name — handles couples / secondary person
    cl._displayName = displayName(cl);

    return cl;
  }

  /**
   * Normalize an array of clients.
   */
  function normalizeAll(clients) {
    if (!Array.isArray(clients)) return [];
    for (var i = 0; i < clients.length; i++) {
      normalize(clients[i]);
    }
    return clients;
  }

  /**
   * Compute display name for a client.
   * Couples: "John & Jane Smith" (same last name) or "John Smith & Jane Doe"
   * Single: name or email or "Unknown"
   */
  function displayName(cl) {
    var primary = cl.name || ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim() || cl.email || 'Unknown';

    if (!cl.secondary_first_name && !cl.secondary_last_name) {
      return primary;
    }

    var secondary = ((cl.secondary_first_name || '') + ' ' + (cl.secondary_last_name || '')).trim();

    // Same last name → "John & Jane Smith"
    if (cl.last_name && cl.secondary_last_name === cl.last_name) {
      return (cl.first_name || '') + ' & ' + (cl.secondary_first_name || '') + ' ' + cl.last_name;
    }

    // Different last names → "John Smith & Jane Doe"
    return primary + ' & ' + secondary;
  }

  return {
    normalize: normalize,
    normalizeAll: normalizeAll,
    displayName: displayName,
  };
})();
