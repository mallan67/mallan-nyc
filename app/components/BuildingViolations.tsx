'use client';

import { useState, useCallback } from 'react';

interface Violation {
  ecb_violation_number?: string;
  ecb_violation_status?: string;
  violation_type?: string;
  severity?: string;
  issue_date_iso?: string;
  balance_due?: string;
  links?: { explore?: string };
}

export default function BuildingViolations({ address }: { address: string }) {
  const [items, setItems] = useState<Violation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadViolations = useCallback(async () => {
    if (items !== null) { setExpanded(!expanded); return; }
    setLoading(true);
    try {
      // Use address to search DOB BIS for BIN, then query ECB violations
      const r = await fetch(`/api/dob/ecb-violations?address=${encodeURIComponent(address)}`);
      if (!r.ok) throw new Error('Failed');
      const data = await r.json();
      setItems(data.items || []);
      setExpanded(true);
    } catch {
      setItems([]);
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  }, [address, items, expanded]);

  const open = items?.filter(v => v.ecb_violation_status?.toLowerCase() === 'resolve');
  const openCount = open?.length || 0;
  const totalBalance = items?.reduce((sum, v) => sum + (parseFloat(v.balance_due || '0') || 0), 0) || 0;

  return (
    <section className="mt-8">
      <button
        onClick={loadViolations}
        className="w-full flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span className="text-sm font-semibold text-gray-900">ECB Violations</span>
          {items !== null && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${openCount > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {openCount > 0 ? `${openCount} open` : 'Clear'}
            </span>
          )}
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {loading && (
        <div className="mt-3 text-center py-4 text-sm text-gray-400">
          <svg className="w-5 h-5 animate-spin inline-block mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Checking NYC DOB records...
        </div>
      )}

      {expanded && items !== null && (
        <div className="mt-3 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-700 font-medium">No ECB violations found</p>
              <p className="text-xs text-green-500 mt-1">This building has a clean violation record.</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="flex gap-4 text-xs">
                <span className="text-gray-600">{items.length} total violations</span>
                {openCount > 0 && <span className="text-red-600 font-medium">{openCount} unresolved</span>}
                {totalBalance > 0 && <span className="text-amber-600 font-medium">Balance: ${totalBalance.toLocaleString()}</span>}
              </div>

              {/* List */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {items.map((v, i) => (
                  <div key={`${v.ecb_violation_number}-${i}`} className="p-3 bg-white rounded-lg border border-gray-100">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium text-gray-900">
                          #{v.ecb_violation_number}
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                            v.ecb_violation_status?.toLowerCase() === 'resolve' ? 'bg-red-100 text-red-700' :
                            v.ecb_violation_status?.toLowerCase() === 'default' ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {v.ecb_violation_status || 'Unknown'}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1">
                          {v.violation_type}{v.severity ? ` — ${v.severity}` : ''} — {v.issue_date_iso || 'No date'}
                        </div>
                        {v.balance_due && parseFloat(v.balance_due) > 0 && (
                          <div className="text-[11px] text-amber-600 font-medium mt-0.5">Balance: ${v.balance_due}</div>
                        )}
                      </div>
                      {v.links?.explore && (
                        <a href={v.links.explore} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline flex-shrink-0">
                          View
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-gray-400">
                Data from NYC Open Data / DOB Environmental Control Board. Updated periodically.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
