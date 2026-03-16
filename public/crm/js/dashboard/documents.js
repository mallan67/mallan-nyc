// ═══════════════════════════════════════════════════════════════════════════════
// CRM DOCUMENTS — Unified document model
// Scopes: company, agent, client, listing, deal
// Status: draft → requested → uploaded → pending_approval → approved → signed → expired
// ═══════════════════════════════════════════════════════════════════════════════
/* global Store, Utils, Permissions, Events, MallanAPI */

var Documents = (function () {
  'use strict';

  var SCOPES = ['company', 'agent', 'client', 'listing', 'deal'];
  var STATUSES = ['draft', 'requested', 'uploaded', 'pending_approval', 'approved', 'signed', 'expired'];
  var DOC_TYPES = [
    'exclusive_agreement', 'buyer_agreement', 'disclosure', 'rider',
    'contract', 'amendment', 'addendum', 'inspection_report', 'appraisal',
    'title_report', 'mortgage_commitment', 'coop_board_package',
    'offering_plan', 'financial_statement', 'tax_return', 'insurance',
    'lease', 'renewal', '1099', 'w9', 'general',
  ];

  // ─── CRUD ────────────────────────────────────────────────────────────
  function list(scope, scopeId) {
    var qs = '?scope=' + scope;
    if (scopeId) qs += '&scopeId=' + scopeId;
    return MallanAPI._fetch('/api/crm/documents' + qs)
      .then(function (data) { return data.documents || []; })
      .catch(function () { return []; });
  }

  function get(id) {
    return MallanAPI._fetch('/api/crm/documents/' + id)
      .then(function (data) { return data.document || data; })
      .catch(function () { return null; });
  }

  function upload(data) {
    // Check permission
    if (!Permissions.canUploadDocument(data.scope)) {
      return Promise.reject(new Error('Permission denied'));
    }

    return MallanAPI._fetch('/api/crm/documents', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(function (result) {
      Events.log('document_uploaded', data.scope, data.scopeId, { docType: data.type, title: data.title });
      return result;
    });
  }

  function uploadFile(scope, scopeId, file, meta) {
    if (!Permissions.canUploadDocument(scope)) {
      return Promise.reject(new Error('Permission denied'));
    }

    var formData = new FormData();
    formData.append('file', file);
    formData.append('scope', scope);
    formData.append('scopeId', scopeId);
    if (meta) {
      Object.keys(meta).forEach(function (k) { formData.append(k, meta[k]); });
    }

    return fetch('/api/crm/documents/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (err) { return Promise.reject(err); });
      return res.json();
    }).then(function (result) {
      Events.log('document_uploaded', scope, scopeId, { title: meta ? meta.title : file.name });
      return result;
    });
  }

  function requestApproval(docId) {
    return MallanAPI._fetch('/api/crm/documents/' + docId + '/request-approval', {
      method: 'POST',
    });
  }

  function approve(docId) {
    if (!Permissions.can('approve_doc')) {
      return Promise.reject(new Error('Only broker can approve documents'));
    }
    return MallanAPI._fetch('/api/crm/documents/' + docId + '/approve', {
      method: 'POST',
    }).then(function (result) {
      Events.log('document_approved', 'document', docId);
      return result;
    });
  }

  function remove(docId) {
    if (!Permissions.can('delete_document')) {
      return Promise.reject(new Error('Only broker can delete documents'));
    }
    return MallanAPI._fetch('/api/crm/documents/' + docId, { method: 'DELETE' });
  }

  // ─── Display helpers ─────────────────────────────────────────────────
  function statusBadge(status) {
    var colors = {
      draft: '#6B7280', requested: '#F59E0B', uploaded: '#3B82F6',
      pending_approval: '#F59E0B', approved: '#059669', signed: '#059669', expired: '#DC2626',
    };
    var c = colors[status] || '#6B7280';
    return '<span style="display:inline-flex;align-items:center;padding:2px 8px;font-size:10px;font-weight:700;border-radius:6px;background:' + c + '15;color:' + c + ';text-transform:uppercase;">' + Utils.esc(status || 'draft') + '</span>';
  }

  function typeIcon(type) {
    var icons = {
      exclusive_agreement: 'fa-file-signature', buyer_agreement: 'fa-file-signature',
      disclosure: 'fa-shield-alt', contract: 'fa-file-contract',
      inspection_report: 'fa-search', appraisal: 'fa-chart-bar',
      lease: 'fa-file-alt', insurance: 'fa-shield-alt',
    };
    return icons[type] || 'fa-file-alt';
  }

  function typeLabel(type) {
    return (type || 'general').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function listAll() {
    return MallanAPI._fetch('/api/crm/documents?limit=500')
      .then(function (data) { return data.documents || []; })
      .catch(function () { return []; });
  }

  return {
    SCOPES: SCOPES,
    STATUSES: STATUSES,
    DOC_TYPES: DOC_TYPES,
    list: list,
    get: get,
    upload: upload,
    uploadFile: uploadFile,
    requestApproval: requestApproval,
    approve: approve,
    remove: remove,
    statusBadge: statusBadge,
    typeIcon: typeIcon,
    typeLabel: typeLabel,
    listAll: listAll,
  };
})();
