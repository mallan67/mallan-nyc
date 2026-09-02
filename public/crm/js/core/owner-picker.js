// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL OWNER PICKER — the one Seller/Landlord selector.
//
// `Listing.owner_client_id` is the ONLY canonical Seller/Landlord owner relation.
// It is a foreign key to a Lead. Everything a human reads — the name, the email —
// is display; the id is the authority.
//
// WHY THIS FILE EXISTS
// --------------------
// The server has accepted and authorised `owner_client_id` on create for some
// time, and the status route refuses to publish a Mallan-local listing without
// one. Neither intake form ever sent it. So every form-created listing was
// ownerless AND permanently unpublishable, and the owner could not be repaired
// afterwards — a workflow dead-end with a guard at the end of it.
//
// It is ONE file mounted by BOTH forms rather than two implementations, because
// the CRM already contains four separately copy-pasted client pickers, each
// hard-wired to fixed element ids with no callback seam. A fifth would be the
// problem, not the fix.
//
// IDENTITY, NOT FREE TEXT
// -----------------------
// The value submitted is the Lead id in a hidden input. The visible input is a
// search box and is never the authority: if a user types a name and does not
// choose from the list, the hidden id stays empty and the listing stays
// ownerless — which is a legal draft state the publication guard will catch.
// Silently matching on a typed name is exactly the free-text identity the
// architecture forbids.
//
// AUTHORIZATION IS THE SERVER'S
// -----------------------------
// This searches `/api/crm/clients?role=…&search=…`. That endpoint already scopes
// to the caller: `findClients` applies `where.agent_id = userId` for any
// non-BROKER session. So an agent's list contains only their own roster, and a
// broker's contains the brokerage — the same boundary `assertLeadAccess`
// enforces when the id is submitted. The picker cannot widen it, and nothing
// here is trusted on the server side.
// ═══════════════════════════════════════════════════════════════════════════════

var OwnerPicker = (function () {
  'use strict';

  /** Escape for interpolation into innerHTML. */
  function E(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function displayName(client) {
    var name = [client.first_name, client.last_name].filter(Boolean).join(' ').trim();
    return name || client.entity_name || client.email || ('Client ' + client.id);
  }

  /** Secondary line: enough to tell two people with the same name apart. */
  function subtitle(client) {
    return [client.email, client.phone].filter(Boolean).join(' · ');
  }

  /**
   * Mount an owner selector.
   *
   * @param {object} cfg
   * @param {string} cfg.searchId  visible search input id
   * @param {string} cfg.hiddenId  hidden input id — MUST be `owner_client_id`
   *                               so the forms' generic field collector sweeps
   *                               it into the POST/PATCH body
   * @param {string} cfg.listId    results container id
   * @param {string} cfg.clearId   optional "clear owner" button id
   * @param {string} cfg.role      'seller' (Sale) or 'landlord' (Rental)
   * @param {function} [cfg.onSelect] called with the chosen client, or null
   */
  function mount(cfg) {
    var search = document.getElementById(cfg.searchId);
    var hidden = document.getElementById(cfg.hiddenId);
    var list = document.getElementById(cfg.listId);
    if (!search || !hidden || !list) return null;

    var timer = null;
    var lastQuery = null;

    function close() {
      list.classList.add('hidden');
      list.innerHTML = '';
    }

    function renderMessage(text) {
      list.innerHTML = '<div class="px-3 py-2 text-sm text-gray-500">' + E(text) + '</div>';
      list.classList.remove('hidden');
    }

    function render(clients) {
      if (!clients.length) {
        // Named explicitly: an agent searching for a client who is on another
        // agent's roster gets an empty list, and should be told that rather than
        // left wondering whether the search is broken.
        renderMessage('No matching ' + cfg.role + ' in your clients.');
        return;
      }
      list.innerHTML = clients
        .map(function (c) {
          return (
            '<button type="button" class="owner-option w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"' +
            ' data-id="' + E(c.id) + '" data-name="' + E(displayName(c)) + '">' +
            '<div class="text-sm font-medium text-gray-900">' + E(displayName(c)) + '</div>' +
            (subtitle(c)
              ? '<div class="text-xs text-gray-500">' + E(subtitle(c)) + '</div>'
              : '') +
            '</button>'
          );
        })
        .join('');
      list.classList.remove('hidden');
    }

    function query(term) {
      if (term === lastQuery) return;
      lastQuery = term;
      renderMessage('Searching…');
      MallanAPI.clients
        .list({ role: cfg.role, search: term, limit: 20 })
        .then(function (res) {
          // Ignore a response that arrived after a newer keystroke.
          if (term !== lastQuery) return;
          render((res && res.clients) || []);
        })
        .catch(function () {
          if (term !== lastQuery) return;
          // FAIL LOUD. A silent empty list would read as "this client does not
          // exist", and the agent would create a duplicate.
          renderMessage('Could not load clients. Check your connection and try again.');
        });
    }

    search.addEventListener('input', function () {
      // Typing invalidates any previous selection: the hidden id must never
      // survive next to a name the user has since edited.
      if (hidden.value) {
        hidden.value = '';
        if (cfg.onSelect) cfg.onSelect(null);
      }
      var term = search.value.trim();
      clearTimeout(timer);
      if (term.length < 2) {
        close();
        lastQuery = null;
        return;
      }
      timer = setTimeout(function () {
        query(term);
      }, 200);
    });

    search.addEventListener('focus', function () {
      var term = search.value.trim();
      if (term.length >= 2 && !hidden.value) query(term);
    });

    list.addEventListener('click', function (e) {
      var opt = e.target.closest('.owner-option');
      if (!opt) return;
      hidden.value = opt.dataset.id;
      search.value = opt.dataset.name;
      close();
      if (cfg.onSelect) {
        cfg.onSelect({ id: opt.dataset.id, name: opt.dataset.name });
      }
    });

    // Close when focus leaves, but not before a click on an option lands.
    document.addEventListener('click', function (e) {
      if (e.target === search) return;
      if (list.contains(e.target)) return;
      close();
    });

    var clearBtn = cfg.clearId ? document.getElementById(cfg.clearId) : null;
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        hidden.value = '';
        search.value = '';
        close();
        if (cfg.onSelect) cfg.onSelect(null);
      });
    }

    return {
      /**
       * Restore a saved owner on edit/reload.
       *
       * The listing GET returns `owner_client_id` (a string) but no client name,
       * so the name is resolved through the same authenticated clients API. If
       * that lookup fails the ID is STILL restored and the box shows the id —
       * losing the id because a display lookup failed would silently unassign
       * the owner on the next save.
       */
      hydrate: function (ownerClientId) {
        if (!ownerClientId) {
          hidden.value = '';
          search.value = '';
          return Promise.resolve(null);
        }
        hidden.value = String(ownerClientId);
        search.value = 'Client ' + ownerClientId;
        return MallanAPI.clients
          .get(ownerClientId)
          .then(function (res) {
            var c = (res && res.client) || res;
            if (c && (c.first_name || c.last_name || c.entity_name || c.email)) {
              search.value = displayName(c);
            }
            return c;
          })
          .catch(function () {
            return null;
          });
      },
      value: function () {
        return hidden.value || null;
      },
    };
  }

  return { mount: mount };
})();

if (typeof window !== 'undefined') window.OwnerPicker = OwnerPicker;
