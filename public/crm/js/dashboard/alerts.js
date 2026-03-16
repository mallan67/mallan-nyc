// ═══════════════════════════════════════════════════════════════════════════════
// CRM ALERTS — Rule-based alert engine
// Severity: info, warning, urgent
// Lifecycle: new → acknowledged → snoozed → resolved → auto-dismissed
// 22 initial rules across client/listing, pipeline, finance, compliance
// ═══════════════════════════════════════════════════════════════════════════════
/* global Store, Utils, Events, MallanAPI */

var Alerts = (function () {
  'use strict';

  var _alerts = [];
  var AUTO_DISMISS_DAYS = 7;

  // E2. Alert rules definitions
  var RULES = [
    // Client / Listing workflow
    { id: 'new_match',           category: 'client',     severity: 'info',    label: 'New matching listing for client' },
    { id: 'price_drop',          category: 'listing',    severity: 'warning', label: 'Price drop on viewed listing' },
    { id: 'price_increase',      category: 'listing',    severity: 'warning', label: 'Price increase on watched listing' },
    { id: 'listing_to_contract', category: 'listing',    severity: 'urgent',  label: 'Listing went to contract' },
    { id: 'back_on_market',      category: 'listing',    severity: 'warning', label: 'Listing back on market' },
    { id: 'open_house_added',    category: 'listing',    severity: 'info',    label: 'Open house added to matching listing' },
    // Pipeline / Conversion
    { id: 'lease_6mo',           category: 'pipeline',   severity: 'info',    label: 'Lease expiry in 6 months' },
    { id: 'lease_90d',           category: 'pipeline',   severity: 'warning', label: 'Lease expiry in 90 days' },
    { id: 'lease_30d',           category: 'pipeline',   severity: 'urgent',  label: 'Lease expiry in 30 days' },
    { id: 'conversion_high',    category: 'pipeline',   severity: 'warning', label: 'High conversion probability' },
    { id: 'client_inactive',     category: 'pipeline',   severity: 'warning', label: 'Client inactive too long' },
    // Finance
    { id: 'commission_submitted', category: 'finance',   severity: 'warning', label: 'Commission request submitted' },
    { id: 'payout_approved',     category: 'finance',    severity: 'info',    label: 'Payout approved' },
    { id: '1099_missing',        category: 'finance',    severity: 'warning', label: '1099 missing data' },
    { id: 'referral_pending',    category: 'finance',    severity: 'warning', label: 'Referral fee pending too long' },
    // Compliance / System
    { id: 'fair_housing',        category: 'compliance', severity: 'urgent',  label: 'Fair housing violation' },
    { id: 'listing_audit_fail',  category: 'compliance', severity: 'urgent',  label: 'Listing audit failed' },
    { id: 'idx_sync_error',      category: 'compliance', severity: 'urgent',  label: 'IDX/RLS sync error' },
    { id: 'doc_expired',         category: 'compliance', severity: 'warning', label: 'Document expired' },
    { id: 'license_expiring',    category: 'compliance', severity: 'warning', label: 'License/CE/E&O expiring soon' },
    { id: 'ce_due',              category: 'compliance', severity: 'warning', label: 'CE hours due' },
    { id: 'eo_expiring',         category: 'compliance', severity: 'warning', label: 'E&O insurance expiring' },
  ];

  // ─── Create alert ────────────────────────────────────────────────────
  function create(ruleId, opts) {
    opts = opts || {};
    var rule = RULES.find(function (r) { return r.id === ruleId; });
    if (!rule) { console.warn('[Alerts] Unknown rule:', ruleId); return null; }

    var alert = {
      id: 'alert_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4),
      ruleId: ruleId,
      ownerType: opts.ownerType || 'agent',         // 'broker' | 'agent'
      ownerId: opts.ownerId || Store.getEffectiveAgentId(),
      severity: rule.severity,
      title: opts.title || rule.label,
      description: opts.description || '',
      sourceEventId: opts.sourceEventId || null,
      entityType: opts.entityType || null,
      entityId: opts.entityId || null,
      actionUrl: opts.actionUrl || null,
      status: 'new',                                  // new | acknowledged | snoozed | resolved | auto-dismissed
      snoozeUntil: null,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
    };

    _alerts.unshift(alert);
    Store.setEntities('alerts', _alerts);
    Store.emit('alert:created', alert);

    // Persist to API
    MallanAPI._fetch('/api/crm/alerts', {
      method: 'POST',
      body: JSON.stringify(alert),
    }).catch(function () { /* local is fine */ });

    return alert;
  }

  // ─── Alert actions ───────────────────────────────────────────────────
  function acknowledge(alertId) {
    _updateStatus(alertId, 'acknowledged');
  }

  function snooze(alertId, hours) {
    hours = hours || 24;
    var until = new Date(Date.now() + hours * 3600000).toISOString();
    _alerts = _alerts.map(function (a) {
      if (a.id === alertId) return Object.assign({}, a, { status: 'snoozed', snoozeUntil: until });
      return a;
    });
    Store.setEntities('alerts', _alerts);
  }

  function resolve(alertId) {
    _updateStatus(alertId, 'resolved');
  }

  function _updateStatus(alertId, status) {
    _alerts = _alerts.map(function (a) {
      if (a.id === alertId) {
        return Object.assign({}, a, {
          status: status,
          resolvedAt: status === 'resolved' ? new Date().toISOString() : a.resolvedAt,
        });
      }
      return a;
    });
    Store.setEntities('alerts', _alerts);
  }

  // ─── E5. Auto-dismiss rules ──────────────────────────────────────────
  function runAutoDismiss() {
    var cutoff = Date.now() - AUTO_DISMISS_DAYS * 86400000;
    _alerts = _alerts.map(function (a) {
      if (a.status === 'new' && a.severity === 'info') {
        if (new Date(a.createdAt).getTime() < cutoff) {
          return Object.assign({}, a, { status: 'auto-dismissed' });
        }
      }
      // Unsnoozed alerts
      if (a.status === 'snoozed' && a.snoozeUntil && new Date(a.snoozeUntil).getTime() < Date.now()) {
        return Object.assign({}, a, { status: 'new', snoozeUntil: null });
      }
      return a;
    });
    Store.setEntities('alerts', _alerts);
  }

  // ─── Query alerts ────────────────────────────────────────────────────
  function getActive(ownerId) {
    return _alerts.filter(function (a) {
      if (a.status === 'resolved' || a.status === 'auto-dismissed') return false;
      if (a.status === 'snoozed') return false;
      if (ownerId && a.ownerId !== ownerId) return false;
      return true;
    });
  }

  function getForEntity(entityType, entityId) {
    return _alerts.filter(function (a) {
      return a.entityType === entityType && a.entityId === entityId &&
        a.status !== 'resolved' && a.status !== 'auto-dismissed';
    });
  }

  function getUrgent() {
    return getActive().filter(function (a) { return a.severity === 'urgent'; });
  }

  function getUnreadCount() {
    return getActive().filter(function (a) { return a.status === 'new'; }).length;
  }

  function getAll() { return _alerts; }

  // ─── Load from API ───────────────────────────────────────────────────
  function load() {
    return MallanAPI._fetch('/api/crm/alerts?status=active&limit=100')
      .then(function (data) {
        _alerts = data.alerts || [];
        Store.setEntities('alerts', _alerts);
        runAutoDismiss();
        return _alerts;
      })
      .catch(function () {
        // Generate sample alerts for demo
        _generateSampleAlerts();
        return _alerts;
      });
  }

  function _generateSampleAlerts() {
    // Only generate if empty
    if (_alerts.length > 0) return;
    create('listing_audit_fail', { title: 'Listing audit needs review', description: 'Check compliance dashboard', severity: 'urgent', ownerType: 'broker' });
  }

  // ─── Severity helpers ────────────────────────────────────────────────
  function severityColor(severity) {
    switch (severity) {
      case 'urgent': return '#DC2626';
      case 'warning': return '#F59E0B';
      default: return '#3B82F6';
    }
  }

  function severityIcon(severity) {
    switch (severity) {
      case 'urgent': return 'fa-exclamation-circle';
      case 'warning': return 'fa-exclamation-triangle';
      default: return 'fa-info-circle';
    }
  }

  function severityBg(severity) {
    switch (severity) {
      case 'urgent': return '#FEF2F2';
      case 'warning': return '#FFFBEB';
      default: return '#EFF6FF';
    }
  }

  return {
    RULES: RULES,
    create: create,
    acknowledge: acknowledge,
    snooze: snooze,
    resolve: resolve,
    runAutoDismiss: runAutoDismiss,
    getActive: getActive,
    getForEntity: getForEntity,
    getUrgent: getUrgent,
    getUnreadCount: getUnreadCount,
    getAll: getAll,
    load: load,
    severityColor: severityColor,
    severityIcon: severityIcon,
    severityBg: severityBg,
  };
})();
