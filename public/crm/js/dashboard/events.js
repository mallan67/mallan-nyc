// ═══════════════════════════════════════════════════════════════════════════════
// CRM EVENTS — Structured event system (activity + audit)
// Schema: { id, type, category, entityType, entityId, actorId, severity, payload, createdAt }
// ═══════════════════════════════════════════════════════════════════════════════
/* global Store, Utils, MallanAPI */

var Events = (function () {
  'use strict';

  // D1. Activity event types
  var ACTIVITY_TYPES = [
    'client_created', 'client_stage_moved', 'listing_sent',
    'showing_scheduled', 'task_completed', 'portal_invite_sent',
    'note_added', 'listing_reaction_recorded', 'quick_send_executed',
  ];

  // D2. Audit event types
  var AUDIT_TYPES = [
    'lead_assigned', 'payout_approved', 'document_uploaded',
    'document_approved', 'compliance_violation_found',
    'impersonation_started', 'impersonation_ended',
    'featured_property_changed', 'settings_updated',
    'listing_submission_logged',
  ];

  // In-memory event log (ephemeral — real events go to API)
  var _localEvents = [];

  // ─── Create event ────────────────────────────────────────────────────
  function log(type, entityType, entityId, payload, severity) {
    var category = AUDIT_TYPES.indexOf(type) !== -1 ? 'audit' : 'activity';
    severity = severity || 'info';

    var evt = {
      id: 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4),
      type: type,
      category: category,
      entityType: entityType,
      entityId: entityId,
      actorId: Store.getEffectiveAgentId(),
      severity: severity,
      payload: payload || {},
      createdAt: new Date().toISOString(),
    };

    // Store locally
    _localEvents.unshift(evt);
    if (_localEvents.length > 500) _localEvents.length = 500;

    // Emit to store listeners
    Store.emit('event:created', evt);

    // Persist to API (fire and forget)
    MallanAPI._fetch('/api/crm/events', {
      method: 'POST',
      body: JSON.stringify(evt),
    }).catch(function () { /* API may not exist yet — local log is fine */ });

    // Check if impersonation event for audit trail
    if (type === 'impersonation_started' || type === 'impersonation_ended') {
      console.info('[Events] Audit:', type, entityId);
    }

    return evt;
  }

  // ─── Query events ────────────────────────────────────────────────────
  function getByEntity(entityType, entityId, limit) {
    limit = limit || 20;
    return _localEvents.filter(function (e) {
      return e.entityType === entityType && e.entityId === entityId;
    }).slice(0, limit);
  }

  function getByCategory(category, limit) {
    limit = limit || 50;
    return _localEvents.filter(function (e) {
      return e.category === category;
    }).slice(0, limit);
  }

  function getRecent(limit) {
    return _localEvents.slice(0, limit || 20);
  }

  function getByType(type, limit) {
    return _localEvents.filter(function (e) { return e.type === type; }).slice(0, limit || 20);
  }

  // ─── Load events from API ────────────────────────────────────────────
  function loadForEntity(entityType, entityId) {
    return MallanAPI._fetch('/api/crm/events?entityType=' + entityType + '&entityId=' + entityId + '&limit=50')
      .then(function (data) {
        var events = data.events || [];
        // Merge into local cache
        events.forEach(function (e) {
          var exists = _localEvents.some(function (le) { return le.id === e.id; });
          if (!exists) _localEvents.push(e);
        });
        // Sort by date desc
        _localEvents.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
        return events;
      })
      .catch(function () { return []; });
  }

  // ─── Event display helpers ───────────────────────────────────────────
  var eventIcons = {
    client_created: 'fa-user-plus',
    client_stage_moved: 'fa-exchange-alt',
    listing_sent: 'fa-paper-plane',
    showing_scheduled: 'fa-calendar-check',
    task_completed: 'fa-check-circle',
    portal_invite_sent: 'fa-envelope',
    note_added: 'fa-sticky-note',
    listing_reaction_recorded: 'fa-heart',
    quick_send_executed: 'fa-bolt',
    lead_assigned: 'fa-user-tag',
    payout_approved: 'fa-dollar-sign',
    document_uploaded: 'fa-file-upload',
    document_approved: 'fa-file-check',
    compliance_violation_found: 'fa-exclamation-triangle',
    impersonation_started: 'fa-user-secret',
    impersonation_ended: 'fa-user-shield',
    featured_property_changed: 'fa-star',
    settings_updated: 'fa-cog',
    listing_submission_logged: 'fa-clipboard-check',
  };

  var eventLabels = {
    client_created: 'Client created',
    client_stage_moved: 'Stage changed',
    listing_sent: 'Listing sent',
    showing_scheduled: 'Showing scheduled',
    task_completed: 'Task completed',
    portal_invite_sent: 'Portal invite sent',
    note_added: 'Note added',
    listing_reaction_recorded: 'Reaction recorded',
    quick_send_executed: 'Quick send',
    lead_assigned: 'Lead assigned',
    payout_approved: 'Payout approved',
    document_uploaded: 'Document uploaded',
    document_approved: 'Document approved',
    compliance_violation_found: 'Compliance issue',
    impersonation_started: 'Impersonation started',
    impersonation_ended: 'Impersonation ended',
    featured_property_changed: 'Featured changed',
    settings_updated: 'Settings updated',
    listing_submission_logged: 'Listing submitted',
  };

  function icon(type) { return eventIcons[type] || 'fa-circle'; }
  function label(type) { return eventLabels[type] || type; }

  return {
    ACTIVITY_TYPES: ACTIVITY_TYPES,
    AUDIT_TYPES: AUDIT_TYPES,
    log: log,
    getByEntity: getByEntity,
    getByCategory: getByCategory,
    getByType: getByType,
    getRecent: getRecent,
    loadForEntity: loadForEntity,
    icon: icon,
    label: label,
  };
})();
