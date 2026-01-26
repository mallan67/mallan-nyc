'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

interface CSVPreviewRow {
  [key: string]: string;
}

interface UploadResult {
  success: boolean;
  message: string;
  imported?: number;
  errors?: string[];
}

const REQUIRED_COLUMNS = [
  'address',
  'unit',
  'neighborhood',
  'borough',
  'price',
  'bedrooms',
  'bathrooms',
  'sqft',
  'property_type',
  'listing_type',
  'status',
];

const SAMPLE_CSV = `address,unit,neighborhood,borough,price,bedrooms,bathrooms,sqft,property_type,listing_type,status,description,agent_name,agent_email,agent_phone
"400 East 90th Street",12B,Upper East Side,Manhattan,1250000,2,2,1100,Condo,sale,active,"Beautiful 2BR with river views",Maya Allan,maya@mallan.nyc,(646) 258-4460
"123 East 72nd Street",6A,Upper East Side,Manhattan,4500,1,1,700,Condo,rent,active,"Elegant pre-war 1BR rental",Maya Allan,maya@mallan.nyc,(646) 258-4460`;

export default function ListingsAdmin() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CSVPreviewRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [listings, setListings] = useState<CSVPreviewRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing listings on mount
  useState(() => {
    fetch('/api/admin/listings')
      .then((res) => res.json())
      .then((data) => {
        if (data.listings) {
          setListings(
            data.listings.map((l: Record<string, unknown>) => ({
              id: l.id,
              address: `${(l.address as Record<string, string>)?.streetNumber || ''} ${(l.address as Record<string, string>)?.streetName || ''}`,
              unit: (l.address as Record<string, string>)?.unit || '',
              neighborhood: (l.address as Record<string, string>)?.neighborhoodDisplay || '',
              price: (l.price as Record<string, number>)?.listPrice?.toString() || '',
              bedrooms: (l.propertyInfo as Record<string, number>)?.bedroomsTotal?.toString() || '',
              bathrooms: (l.propertyInfo as Record<string, number>)?.bathroomsFull?.toString() || '',
              listing_type: l.listingType as string || '',
              status: l.status as string || '',
              agent_name: (l.agent as Record<string, string>)?.listAgentName || '',
            }))
          );
        }
      })
      .catch(console.error);
  });

  const parseCSV = (text: string): { headers: string[]; rows: CSVPreviewRow[] } => {
    const lines = text.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    // Parse CSV properly handling quoted fields
    const parseRow = (row: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
    const rows: CSVPreviewRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseRow(lines[i]);
      if (values.length === headers.length) {
        const row: CSVPreviewRow = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx];
        });
        rows.push(row);
      }
    }

    return { headers, rows };
  };

  const validateCSV = (headers: string[]): string[] => {
    const errors: string[] = [];
    const missingColumns = REQUIRED_COLUMNS.filter(
      (col) => !headers.includes(col)
    );

    if (missingColumns.length > 0) {
      errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
    }

    return errors;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setUploadResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers, rows } = parseCSV(text);

      setColumns(headers);
      setPreview(rows.slice(0, 5)); // Preview first 5 rows

      const errors = validateCSV(headers);
      setValidationErrors(errors);
    };
    reader.readAsText(selectedFile);
  };

  const handleUpload = async () => {
    if (!file || validationErrors.length > 0) return;

    setIsUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/admin/listings/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      setUploadResult(result);

      if (result.success) {
        // Reset form
        setFile(null);
        setPreview([]);
        setColumns([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        // Reload listings
        const listingsRes = await fetch('/api/admin/listings');
        const listingsData = await listingsRes.json();
        if (listingsData.listings) {
          setListings(
            listingsData.listings.map((l: Record<string, unknown>) => ({
              id: l.id,
              address: `${(l.address as Record<string, string>)?.streetNumber || ''} ${(l.address as Record<string, string>)?.streetName || ''}`,
              unit: (l.address as Record<string, string>)?.unit || '',
              neighborhood: (l.address as Record<string, string>)?.neighborhoodDisplay || '',
              price: (l.price as Record<string, number>)?.listPrice?.toString() || '',
              bedrooms: (l.propertyInfo as Record<string, number>)?.bedroomsTotal?.toString() || '',
              bathrooms: (l.propertyInfo as Record<string, number>)?.bathroomsFull?.toString() || '',
              listing_type: l.listingType as string || '',
              status: l.status as string || '',
              agent_name: (l.agent as Record<string, string>)?.listAgentName || '',
            }))
          );
        }
      }
    } catch (error) {
      setUploadResult({
        success: false,
        message: 'Upload failed. Please try again.',
        errors: [String(error)],
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'listings_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <Link
            href="/admin"
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
          >
            ← Back to Admin
          </Link>
          <h1 className="text-xl sm:text-2xl font-semibold">Listings Management</h1>
        </div>
      </div>

      {/* CSV Upload Section */}
      <div className="bg-white border rounded-lg p-4 sm:p-6 mb-6 sm:mb-8">
        <h2 className="text-lg font-semibold mb-4">Import Listings via CSV</h2>

        <div className="mb-4">
          <button
            onClick={downloadTemplate}
            className="text-sm text-brand-gold hover:underline"
          >
            Download CSV Template
          </button>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-8 text-center mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
            id="csv-upload"
          />
          <label
            htmlFor="csv-upload"
            className="cursor-pointer block"
          >
            <div className="text-gray-500">
              <svg
                className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-sm sm:text-base">
                {file ? file.name : 'Click to upload or drag and drop'}
              </p>
              <p className="text-xs text-gray-400 mt-1">CSV files only</p>
            </div>
          </label>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-red-700 mb-2">Validation Errors</h3>
            <ul className="list-disc list-inside text-sm text-red-600">
              {validationErrors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Upload Result */}
        {uploadResult && (
          <div
            className={`border rounded-lg p-4 mb-4 ${
              uploadResult.success
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}
          >
            <p
              className={`font-semibold ${
                uploadResult.success ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {uploadResult.message}
            </p>
            {uploadResult.imported && (
              <p className="text-sm text-green-600 mt-1">
                {uploadResult.imported} listings imported successfully
              </p>
            )}
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <ul className="list-disc list-inside text-sm text-red-600 mt-2">
                {uploadResult.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Preview Table */}
        {preview.length > 0 && validationErrors.length === 0 && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">
              Preview ({preview.length} of {file ? 'many' : '0'} rows)
            </h3>
            <div className="overflow-x-auto border rounded">
              <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {columns.slice(0, 6).map((col) => (
                      <th
                        key={col}
                        className="px-2 sm:px-4 py-2 text-left font-medium text-gray-500"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {preview.map((row, idx) => (
                    <tr key={idx}>
                      {columns.slice(0, 6).map((col) => (
                        <td key={col} className="px-2 sm:px-4 py-2 truncate max-w-[100px] sm:max-w-[150px]">
                          {row[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Upload Button */}
        {file && validationErrors.length === 0 && (
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="w-full sm:w-auto px-6 py-2 bg-brand-gold text-white rounded hover:bg-brand-gold/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? 'Uploading...' : 'Import Listings'}
          </button>
        )}
      </div>

      {/* Required Columns Reference */}
      <div className="bg-gray-50 border rounded-lg p-4 sm:p-6 mb-6 sm:mb-8">
        <h3 className="font-semibold mb-3">Required CSV Columns</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs sm:text-sm">
          {REQUIRED_COLUMNS.map((col) => (
            <div key={col} className="bg-white px-2 sm:px-3 py-1 rounded border">
              {col}
            </div>
          ))}
        </div>
        <p className="text-xs sm:text-sm text-gray-500 mt-3">
          Optional columns: description, agent_name, agent_email, agent_phone,
          year_built, maintenance_fee, common_charges, doorman, elevator, gym,
          pets_allowed, image_url
        </p>
      </div>

      {/* Current Listings */}
      <div className="bg-white border rounded-lg p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-4">
          Current Listings ({listings.length})
        </h2>
        {listings.length === 0 ? (
          <p className="text-gray-500">No listings found. Import some using the CSV upload above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 sm:px-4 py-2 text-left font-medium text-gray-500">
                    Address
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-left font-medium text-gray-500 hidden sm:table-cell">
                    Neighborhood
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-left font-medium text-gray-500">
                    Price
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-left font-medium text-gray-500 hidden md:table-cell">
                    Beds/Baths
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-left font-medium text-gray-500">
                    Type
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-left font-medium text-gray-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {listings.map((listing, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-4 py-2">
                      <div className="font-medium">
                        {listing.address}
                        {listing.unit && `, ${listing.unit}`}
                      </div>
                      <div className="text-gray-500 sm:hidden text-xs">
                        {listing.neighborhood}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 hidden sm:table-cell">
                      {listing.neighborhood}
                    </td>
                    <td className="px-2 sm:px-4 py-2">
                      ${Number(listing.price).toLocaleString()}
                      {listing.listing_type === 'rent' && '/mo'}
                    </td>
                    <td className="px-2 sm:px-4 py-2 hidden md:table-cell">
                      {listing.bedrooms} bd / {listing.bathrooms} ba
                    </td>
                    <td className="px-2 sm:px-4 py-2">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          listing.listing_type === 'sale'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}
                      >
                        {listing.listing_type}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          listing.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : listing.status === 'sold'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {listing.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
