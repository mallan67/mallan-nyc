// ═══════════════════════════════════════════════════════════════
// SEARCH REGISTRY LOADER — Source of truth for all search fields
// Loads search-registry.json and provides fast lookup API
// ═══════════════════════════════════════════════════════════════
var SearchRegistry = (function() {
  'use strict';
  var _registry = null;
  var _fieldIndex = {};
  var _sectionIndex = {};
  var _tabIndex = {};

  function load(registryData) {
    _registry = registryData;
    _fieldIndex = {};
    _sectionIndex = {};
    _tabIndex = {};
    (_registry.fields || []).forEach(function(f) {
      _fieldIndex[f.key] = f;
      var sec = f.section || '_none';
      if (!_sectionIndex[sec]) _sectionIndex[sec] = [];
      _sectionIndex[sec].push(f);
      var tabs = f.tabs || ['sale', 'rent', 'building'];
      tabs.forEach(function(t) {
        if (!_tabIndex[t]) _tabIndex[t] = [];
        _tabIndex[t].push(f);
      });
    });
  }

  function getField(key) { return _fieldIndex[key] || null; }
  function getFieldsForSection(sectionKey) { return _sectionIndex[sectionKey] || []; }
  function getFieldsForTab(tab) { return _tabIndex[tab] || []; }
  function getSearchableFields(tab) {
    return getFieldsForTab(tab).filter(function(f) {
      return f.providers && Object.keys(f.providers).length > 0 && f.widget !== 'calculator';
    });
  }
  function getSections() { return (_registry && _registry.sections) || []; }
  function getSectionsForTab(tab) {
    var tabFields = getFieldsForTab(tab);
    var secs = {};
    tabFields.forEach(function(f) { secs[f.section] = true; });
    return getSections().filter(function(s) {
      if (s.tabs && !s.tabs.includes(tab)) return false;
      return secs[s.key];
    });
  }
  function getTrestleField(key) {
    var f = _fieldIndex[key];
    return f && f.providers && f.providers.trestle ? f.providers.trestle : null;
  }
  function getPrismaField(key) {
    var f = _fieldIndex[key];
    return f && f.providers && f.providers.prisma ? f.providers.prisma : null;
  }
  function getFieldCount() { return _registry ? (_registry.fields || []).length : 0; }
  function isLoaded() { return _registry !== null; }

  function validate() {
    var errors = [];
    if (!_registry) { return { valid: false, errors: ['Registry not loaded'] }; }
    var keys = {};
    (_registry.fields || []).forEach(function(f, i) {
      if (!f.key) errors.push('Field[' + i + ']: missing key');
      if (!f.label) errors.push('Field ' + f.key + ': missing label');
      if (!f.section) errors.push('Field ' + f.key + ': missing section');
      if (!f.widget) errors.push('Field ' + f.key + ': missing widget');
      if (keys[f.key]) errors.push('Duplicate key: ' + f.key);
      keys[f.key] = true;
      if (f.section) {
        var secExists = (_registry.sections || []).some(function(s) { return s.key === f.section; });
        if (!secExists) errors.push('Field ' + f.key + ': section "' + f.section + '" not in sections array');
      }
      if (f.providers && f.providers.trestle && !f.crm_internal) {
        if (!f.providers.trestle.field) errors.push('Field ' + f.key + ': trestle provider missing field name');
      }
    });
    return { valid: errors.length === 0, errors: errors };
  }

  return {
    load: load,
    getField: getField,
    getFieldsForSection: getFieldsForSection,
    getFieldsForTab: getFieldsForTab,
    getSearchableFields: getSearchableFields,
    getSections: getSections,
    getSectionsForTab: getSectionsForTab,
    getTrestleField: getTrestleField,
    getPrismaField: getPrismaField,
    getRegistry: function() { return _registry; },
    getFieldCount: getFieldCount,
    isLoaded: isLoaded,
    validate: validate
  };
})();

/* TEST — run in browser console:
   fetch('/crm/data/search-registry.json').then(r => r.json()).then(d => {
     SearchRegistry.load(d);
     console.log('Loaded:', SearchRegistry.getFieldCount(), 'fields');
     console.log('beds:', SearchRegistry.getField('beds'));
     console.log('sale fields:', SearchRegistry.getFieldsForTab('sale').length);
     console.log('sections for sale:', SearchRegistry.getSectionsForTab('sale').length);
     console.log('validation:', SearchRegistry.validate());
   });
*/
