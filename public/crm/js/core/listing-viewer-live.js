// ═══════════════════════════════════════════════════════════════════════════════
// LISTING VIEWER — LIVE COTALITY LOADER (Sales Tools and Rental Tools read-only pages)
//
// An RLS listing (RLS… id) is read LIVE from Cotality through the agent search route
// (/api/idx/search, one exact ListingId request that also carries the Cotality row: raw=1) and its
// photos and floor plans through /api/media/batch. The row is shaped as the CRM listing record the
// viewers hydrate from (js/forms/listing-hydration.js reads raw_data / features / address by the
// live Cotality field names), so a live listing and a Mallan-only listing (SL-… / RL-…, from
// /api/crm/listings/:id) render through one path. Nothing is read from a database copy of an RLS
// listing (owner rule; 2026-10-27). Loaded after js/core/api-client.js.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    function text(v) { return v == null ? '' : String(v); }

    // Cotality StandardStatus (as the search mapper reports it) → the viewer's status value
    var SALE_STATUS = { ACTIVE: 'Active', COMING_SOON: 'ComingSoon', PENDING: 'ContractSigned', ACTIVE_UNDER_CONTRACT: 'ContractSigned', CLOSED: 'Sold', INCOMPLETE: 'Future', EXPIRED: 'Expired', WITHDRAWN: 'Withdrawn', HOLD: 'Hold', CANCELLED: 'Cancelled', CANCELED: 'Cancelled', DELETE: 'Cancelled' };
    var RENT_STATUS = { ACTIVE: 'Active', COMING_SOON: 'ComingSoon', PENDING: 'LeaseSigned', ACTIVE_UNDER_CONTRACT: 'LeaseSigned', CLOSED: 'Rented', INCOMPLETE: 'Future', EXPIRED: 'Expired', WITHDRAWN: 'Withdrawn', HOLD: 'Hold', CANCELLED: 'Cancelled', CANCELED: 'Cancelled', DELETE: 'Cancelled' };

    // Live CommonInterest / PropertySubType / StructureType → the forms' property type radio value
    function propertyTypeRadio(l) {
        var ci = text(l.ownership), sub = text(l.propertySubType), st = text(l.StructureType);
        if (ci === 'Condominium') return 'Condo';
        if (ci === 'StockCooperative') return 'Coop';
        if (ci === 'Condop') return 'Condop';
        if (ci === 'RentalBuilding') return 'RentalBuilding';
        if (/Townhouse/.test(st)) return sub === 'MultiFamily' ? 'MultiFamilyTownhouse' : 'SingleFamilyTownhouse';
        if (sub === 'SingleFamilyResidence') return 'SingleFamily';
        if (sub === 'MultiFamily') return 'MultiFamily';
        if (sub === 'MixedUse') return 'MixedUse';
        if (sub === 'Loft') return 'Loft';
        if (sub === 'Duplex' || sub === 'Triplex' || sub === 'Quadruplex') return sub;
        if (sub === 'DeededParking') return 'DeededParking';
        if (sub === 'Office' || sub === 'Retail') return sub;
        return sub || ci || '';
    }

    // The REBNY CustomFields of the expanded CustomProperty row (a JSON string or an object), as plain keys
    function customFields(raw) {
        var cp = raw.CustomProperty;
        if (Array.isArray(cp)) cp = cp[0];
        var cf = cp && cp.CustomFields;
        if (typeof cf === 'string') { try { cf = JSON.parse(cf); } catch (e) { cf = null; } }
        return cf && typeof cf === 'object' ? cf : {};
    }

    // The CRM listing record shape (what /api/crm/listings/:id answers) from the live Cotality row + the mapped search row
    function liveRecord(l, raw, id, side) {
        var rawData = {};
        Object.keys(raw).forEach(function (k) { if (k !== 'CustomProperty' && k !== 'Media') rawData[k] = raw[k]; });
        var cf = customFields(raw);
        Object.keys(cf).forEach(function (k) { if (rawData[k] === undefined) rawData[k] = cf[k]; });
        var prefix = side === 'rental' ? 'rental' : 'sale';
        rawData[prefix + 'PropertyType'] = propertyTypeRadio(l);            // the forms' own classification key, so the radio restores
        // The video boxes show the UNBRANDED links the search mapper classified as videos (VirtualTourURLUnbranded/2/3; the branded
        // fields are never read — owner rule 2026-10-26); the 3D box shows VirtualTourURLUnbranded itself through the hydration table.
        var videos = (l.tours || []).filter(function (t) { return t && t.kind === 'video' && t.url; }).map(function (t) { return t.url; });
        rawData[prefix + 'VideoUrl'] = videos[0] || '';
        rawData[prefix + 'VideoTourUrl'] = videos[1] || '';
        // the tour boxes are saved under their own ids and claim no Cotality field (Maya, 2026-10-09): a live listing's links reach them by those keys
        rawData[prefix + 'MatterportUrl'] = raw.VirtualTourURLBranded || '';
        rawData[prefix + 'VirtualTourUnbranded2'] = raw.VirtualTourURLUnbranded2 || '';
        rawData[prefix + 'VirtualTourUnbranded3'] = raw.VirtualTourURLUnbranded3 || '';
        var agent = l.agent || {};
        var status = (side === 'rental' ? RENT_STATUS : SALE_STATUS)[text(l.status).toUpperCase()] || text(raw.StandardStatus);
        return {
            id: text(raw.ListingKey || l.wid || id),
            listing_id: text(raw.ListingId || l.lid || id),
            mls_id: text(raw.ListingId || l.lid || id),
            status: status,
            list_price: raw.ListPrice != null ? raw.ListPrice : l.price,
            bedrooms_total: raw.BedroomsTotal, bathrooms_full: raw.BathroomsFull, bathrooms_half: raw.BathroomsHalf, living_area: raw.LivingArea,
            address: {
                StreetNumber: raw.StreetNumber, StreetDirPrefix: raw.StreetDirPrefix, StreetName: raw.StreetName,
                StreetSuffix: raw.StreetSuffix, StreetDirSuffix: raw.StreetDirSuffix, UnitNumber: raw.UnitNumber, UnparsedAddress: raw.UnparsedAddress
            },
            city: raw.City, postal_code: raw.PostalCode, borough: raw.CityRegion, county: raw.CountyOrParish,
            neighborhood: raw.SubdivisionName || l.neighborhood || '',
            property_type: propertyTypeRadio(l), property_sub_type: raw.PropertySubType, common_interest: raw.CommonInterest,
            list_agent_full_name: raw.ListAgentFullName || agent.name, list_agent_mls_id: raw.ListAgentMlsId || agent.mlsId,
            list_agent_direct_phone: raw.ListAgentDirectPhone || agent.directPhone, list_agent_email: raw.ListAgentEmail || agent.email,
            list_office_name: raw.ListOfficeName || (l.office || {}).name, list_office_mls_id: raw.ListOfficeMlsId || (l.office || {}).mlsId,
            agent_info: {
                ListAgentFullName: raw.ListAgentFullName, ListAgentMlsId: raw.ListAgentMlsId, ListAgentDirectPhone: raw.ListAgentDirectPhone,
                ListAgentEmail: raw.ListAgentEmail, ListAgentStateLicense: raw.ListAgentStateLicense, ListOfficeName: raw.ListOfficeName
            },
            features: rawData, raw_data: rawData,
            rls_eligible: true,
            idx_display_yn: raw.IDXEntireListingDisplayYN, internet_entire_listing_display_yn: raw.InternetEntireListingDisplayYN, internet_address_display_yn: raw.InternetAddressDisplayYN,
            listing_contract_date: raw.ListingContractDate, created_at: raw.OriginalEntryTimestamp, updated_at: raw.ModificationTimestamp,
            tours: l.tours || [], videos_count: l.videosCount != null ? l.videosCount : null,
            _source: 'cotality_live', _live: l
        };
    }

    // Live photos and floor plans of an RLS listing (/api/media/batch?detail=true: the server's own classification, Photo / FloorPlan)
    function liveMedia(lid) {
        return fetch('/api/media/batch?ids=' + encodeURIComponent(lid) + '&detail=true', { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (data) {
                var rows = (data && data.media && data.media[lid]) || [];
                var pick = function (kind) {
                    var seen = {};
                    return rows.filter(function (m) { return m && m.url && m.mediaType === kind; })
                        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
                        .map(function (m) { return m.url; })
                        .filter(function (u) { if (seen[u]) return false; seen[u] = true; return true; });
                };
                return { photos: pick('Photo'), plans: pick('FloorPlan') };
            });
    }

    // 'sale' | 'rental' for a Mallan-only id (SL-… / RL-…), null for anything else (an RLS id is read live)
    function mallanSide(id) {
        var m = /^(SL|RL)-/i.exec(text(id));
        return m ? (m[1].toUpperCase() === 'RL' ? 'rental' : 'sale') : null;
    }

    // The live CRM-shaped record of an RLS listing (rejects when live Cotality has no such listing for this licence)
    function liveListing(id, side) {
        if (typeof MallanAPI === 'undefined' || !MallanAPI.idx || typeof MallanAPI.idx.search !== 'function') {
            return Promise.reject(new Error('The live listing service is unavailable.'));
        }
        return MallanAPI.idx.search({ listingId: text(id).toUpperCase(), status: '*', limit: 1, raw: '1' }).then(function (res) {
            var l = res && res.listings && res.listings[0];
            if (!l || !l.raw || typeof l.raw !== 'object') throw new Error('Listing ' + id + ' is not in live Cotality for this licence');
            return liveRecord(l, l.raw, id, side);
        });
    }

    window.viewerMallanSide = mallanSide;
    window.viewerLiveListing = liveListing;
    window.viewerLiveMedia = liveMedia;
    window.viewerLiveRecord = liveRecord;
})();
