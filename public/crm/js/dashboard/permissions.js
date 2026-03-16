// ═══════════════════════════════════════════════════════════════════════════════
// CRM PERMISSIONS — Role-based access control
// Roles: Broker, Agent, Broker-as-Agent (impersonation)
// Legend: V=view, C=create, E=edit, D=delete, A=approve, R=reassign, I=impersonate, X=no access
// ═══════════════════════════════════════════════════════════════════════════════
/* global Store */

var Permissions = (function () {
  'use strict';

  // ─── Core role checks ──────────────────────────────────────────────────
  function _role() {
    if (Store.isBroker() && Store.isImpersonating()) return 'broker_as_agent';
    if (Store.isBroker()) return 'broker';
    return 'agent';
  }

  function isBroker() { return Store.isBroker(); }
  function isImpersonating() { return Store.isImpersonating(); }

  // ─── Permission Matrix (C1-C7) ────────────────────────────────────────
  var matrix = {
    // C1. People / Licensing
    view_all_agents:     { broker: true, agent: false, broker_as_agent: false },
    create_agent:        { broker: true, agent: false, broker_as_agent: false },
    edit_agent_profile:  { broker: true, agent: 'own', broker_as_agent: 'own' },
    deactivate_agent:    { broker: true, agent: false, broker_as_agent: false },
    set_agent_password:  { broker: true, agent: 'own', broker_as_agent: 'own' },
    view_licensing_all:  { broker: true, agent: false, broker_as_agent: false },
    edit_licensing:      { broker: true, agent: 'own_ro', broker_as_agent: 'own' },

    // C2. Leads / Clients
    view_all_leads:      { broker: true, agent: false, broker_as_agent: false },
    assign_lead:         { broker: true, agent: false, broker_as_agent: false },
    convert_lead:        { broker: true, agent: 'assigned', broker_as_agent: 'assigned' },
    view_all_clients:    { broker: true, agent: false, broker_as_agent: false },
    view_assigned_clients: { broker: true, agent: true, broker_as_agent: true },
    create_client:       { broker: true, agent: true, broker_as_agent: true },
    edit_assigned_client: { broker: true, agent: true, broker_as_agent: true },
    reassign_client:     { broker: true, agent: false, broker_as_agent: false },
    delete_client:       { broker: true, agent: false, broker_as_agent: false },

    // C3. Listings
    view_all_listings:   { broker: true, agent: false, broker_as_agent: false },
    view_own_listings:   { broker: true, agent: true, broker_as_agent: true },
    create_listing:      { broker: true, agent: true, broker_as_agent: true },
    edit_own_listing:    { broker: true, agent: true, broker_as_agent: true },
    edit_all_listings:   { broker: true, agent: false, broker_as_agent: false },
    run_compliance:      { broker: true, agent: 'own', broker_as_agent: 'own' },
    change_featured:     { broker: true, agent: false, broker_as_agent: false },

    // C4. Deals / Payouts / Finance
    view_all_deals:      { broker: true, agent: false, broker_as_agent: false },
    view_own_deals:      { broker: true, agent: true, broker_as_agent: true },
    submit_commission:   { broker: true, agent: true, broker_as_agent: true },
    approve_payout:      { broker: true, agent: false, broker_as_agent: false },
    view_company_revenue: { broker: true, agent: false, broker_as_agent: false },
    view_personal_revenue: { broker: true, agent: true, broker_as_agent: true },
    generate_1099:       { broker: true, agent: false, broker_as_agent: false },

    // C5. Referrals
    view_all_referrals:  { broker: true, agent: 'owned', broker_as_agent: false },
    create_referral:     { broker: true, agent: 'allowed', broker_as_agent: true },
    edit_referral:       { broker: true, agent: 'own', broker_as_agent: 'own' },
    approve_referral_fee: { broker: true, agent: false, broker_as_agent: false },

    // C6. Documents
    view_company_docs:   { broker: true, agent: 'approved', broker_as_agent: 'approved' },
    upload_company_docs: { broker: true, agent: false, broker_as_agent: false },
    upload_scoped_doc:   { broker: true, agent: 'request', broker_as_agent: 'request' },
    approve_doc:         { broker: true, agent: false, broker_as_agent: false },
    delete_document:     { broker: true, agent: false, broker_as_agent: false },
    view_scoped_docs:    { broker: true, agent: 'scoped', broker_as_agent: 'scoped' },

    // C7. System / Compliance / Audit
    view_audit_log:      { broker: true, agent: false, broker_as_agent: false },
    view_idx_activity:   { broker: true, agent: false, broker_as_agent: false },
    view_compliance:     { broker: true, agent: 'own', broker_as_agent: 'own' },
    change_settings:     { broker: true, agent: false, broker_as_agent: false },
    impersonate_agent:   { broker: true, agent: false, broker_as_agent: false },
  };

  // ─── can(action, subject?) ─────────────────────────────────────────────
  function can(action, subject) {
    var rule = matrix[action];
    if (!rule) return false;

    var role = _role();
    var val = rule[role];

    if (val === true) return true;
    if (val === false || val === undefined) return false;

    // Ownership checks
    var userId = Store.getEffectiveAgentId();
    if (val === 'own' || val === 'own_ro' || val === 'assigned' || val === 'owned') {
      if (!subject) return true; // No subject to check → allow (caller handles filtering)
      var ownerId = subject.assignedAgentId || subject.assigned_agent_id || subject.agentId || subject.agent_id || subject.uploadedBy;
      return ownerId === userId;
    }

    // Scoped/approved/request — these are filtered server-side, allow client to show UI
    if (val === 'approved' || val === 'scoped' || val === 'request' || val === 'allowed') {
      return true;
    }

    return false;
  }

  // ─── C8. Required Permission Helpers ─────────────────────────────────
  function canViewAllClients() { return can('view_all_clients'); }
  function canReassignClient(client) { return can('reassign_client', client); }
  function canImpersonate(agent) { return can('impersonate_agent', agent); }
  function canApprovePayout(deal) { return can('approve_payout', deal); }
  function canUploadDocument(scope) {
    if (scope === 'company') return can('upload_company_docs');
    return can('upload_scoped_doc');
  }
  function canEditListing(listing) {
    if (can('edit_all_listings')) return true;
    return can('edit_own_listing', listing);
  }
  function canViewCompliance(listing) { return can('view_compliance', listing); }
  function canAssignLead(lead) { return can('assign_lead', lead); }

  // ─── Sidebar visibility ──────────────────────────────────────────────
  function canSeeBrokerConsole() { return isBroker() && !isImpersonating(); }
  function canSeeOperations() { return Store.isAgent(); }

  return {
    can: can,
    isBroker: isBroker,
    isImpersonating: isImpersonating,
    canViewAllClients: canViewAllClients,
    canReassignClient: canReassignClient,
    canImpersonate: canImpersonate,
    canApprovePayout: canApprovePayout,
    canUploadDocument: canUploadDocument,
    canEditListing: canEditListing,
    canViewCompliance: canViewCompliance,
    canAssignLead: canAssignLead,
    canSeeBrokerConsole: canSeeBrokerConsole,
    canSeeOperations: canSeeOperations,
  };
})();
