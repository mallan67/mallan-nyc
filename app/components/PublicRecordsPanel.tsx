'use client';

import { useState, useEffect } from 'react';

interface AcrisDocument {
  type: string;
  date: string;
  parties: string[];
  amount?: string;
}

interface DobSummary {
  status: 'good-standing' | 'issues' | 'unknown';
  activeViolations: number;
  openComplaints: number;
  details: string;
}

interface TaxAssessment {
  assessedValue: number | null;
  annualTax: number | null;
  monthlyTax: number | null;
  taxYear: string;
  confirmed: boolean;
}

interface PublicRecordsData {
  acris: AcrisDocument[];
  dob: DobSummary;
  tax: TaxAssessment;
  bbl: string;
  lastFetched: string;
}

interface PublicRecordsPanelProps {
  bbl: string;
  borough: string;
  houseNumber: string;
  street: string;
  listedMonthlyTax?: number | null;
}

export default function PublicRecordsPanel({
  bbl,
  borough,
  houseNumber,
  street,
  listedMonthlyTax,
}: PublicRecordsPanelProps) {
  const [data, setData] = useState<PublicRecordsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!bbl) {
      setLoading(false);
      return;
    }

    fetch(
      `/api/public-records?bbl=${encodeURIComponent(bbl)}&houseNumber=${encodeURIComponent(houseNumber)}&street=${encodeURIComponent(street)}`
    )
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [bbl, houseNumber, street]);

  // Build external links
  const [boro, block, lot] = bbl.split('-');
  const boroCode: Record<string, string> = {
    Manhattan: '1', Bronx: '2', Brooklyn: '3', Queens: '4', 'Staten Island': '5',
  };
  const bc = boroCode[borough] || boro;
  const streetEncoded = encodeURIComponent(street);

  const acrisUrl = `https://a836-acris.nyc.gov/DS/DocumentSearch/BBLResult?Borough=${bc}&Block=${block}&Lot=${lot}`;
  const dobUrl = `https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?boro=${bc}&houseno=${houseNumber}&street=${streetEncoded}`;
  const taxUrl = `https://a836-pts-access.nyc.gov/care/search/commonsearch.aspx?mode=persprop&boro=${bc}&block=${block}&lot=${lot}`;

  if (loading) {
    return (
      <section className="bg-white rounded-lg p-6 border">
        <h2 className="text-xl font-sans mb-4">Public Records</h2>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-48" />
          <div className="h-20 bg-gray-100 rounded" />
          <div className="h-20 bg-gray-100 rounded" />
          <div className="h-20 bg-gray-100 rounded" />
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-lg p-6 border">
      <h2 className="text-xl font-sans mb-2">Public Records</h2>
      <p className="text-sm text-gray-500 mb-4">
        Official NYC records for this property (BBL: {bbl})
      </p>

      {error && (
        <p className="text-sm text-gray-500 mb-4">Unable to load records. View directly below.</p>
      )}

      <div className="space-y-5">
        {/* DOB — Building Status */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Building Status (DOB)</h3>
            <a
              href={dobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              Full Report
            </a>
          </div>
          {data?.dob ? (
            <div className="flex items-center gap-3">
              {data.dob.status === 'good-standing' ? (
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : data.dob.status === 'issues' ? (
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              )}
              <div>
                <p className={`text-sm font-medium ${
                  data.dob.status === 'good-standing' ? 'text-green-700' :
                  data.dob.status === 'issues' ? 'text-amber-700' : 'text-gray-600'
                }`}>
                  {data.dob.status === 'good-standing' ? 'Building in Good Standing' :
                   data.dob.status === 'issues' ? 'Active Issues on File' : 'Status Unknown'}
                </p>
                <p className="text-xs text-gray-500">{data.dob.details}</p>
              </div>
            </div>
          ) : (
            <a href={dobUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
              View building records
            </a>
          )}
        </div>

        {/* Tax Assessment */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Property Tax</h3>
            <a
              href={taxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              Tax Bills
            </a>
          </div>
          {data?.tax && data.tax.confirmed ? (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold text-gray-900">
                  ${data.tax.monthlyTax?.toLocaleString()}/mo
                </span>
                <span className="text-xs text-gray-500">
                  (${data.tax.annualTax?.toLocaleString()}/yr)
                </span>
              </div>
              {listedMonthlyTax && data.tax.monthlyTax && (
                <div className="mt-1">
                  {Math.abs(listedMonthlyTax - data.tax.monthlyTax) <= 50 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Matches listing
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                      </svg>
                      Listing shows ${listedMonthlyTax.toLocaleString()}/mo
                    </span>
                  )}
                </div>
              )}
              {data.tax.assessedValue && (
                <p className="text-xs text-gray-500 mt-1">
                  Assessed value: ${data.tax.assessedValue.toLocaleString()}
                  {data.tax.taxYear && ` (${data.tax.taxYear})`}
                </p>
              )}
            </div>
          ) : (
            <a href={taxUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
              View tax records
            </a>
          )}
        </div>

        {/* ACRIS — Document History */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Property Documents (ACRIS)</h3>
            <a
              href={acrisUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              All Documents
            </a>
          </div>
          {data?.acris && data.acris.length > 0 ? (
            <div className="divide-y">
              {data.acris.slice(0, 5).map((doc, i) => (
                <div key={i} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{doc.type}</span>
                    <span className="text-xs text-gray-500">{doc.date}</span>
                  </div>
                  {doc.amount && (
                    <p className="text-sm text-gray-600">{doc.amount}</p>
                  )}
                  {doc.parties.length > 0 && (
                    <p className="text-xs text-gray-400 truncate">
                      {doc.parties.join(' / ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <a href={acrisUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
              View property documents
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
