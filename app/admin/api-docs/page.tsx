'use client';

import { useState } from 'react';
import Link from 'next/link';

interface APIEndpoint {
  method: string;
  path: string;
  description: string;
  parameters?: { name: string; type: string; description: string; required?: boolean }[];
  exampleResponse?: string;
}

const ENDPOINTS: APIEndpoint[] = [
  {
    method: 'GET',
    path: '/api/v1/agents',
    description: 'Retrieve all agents with optional filtering',
    parameters: [
      { name: 'id', type: 'string', description: 'Filter by agent ID' },
      { name: 'name', type: 'string', description: 'Filter by agent name (partial match)' },
      { name: 'featured', type: 'boolean', description: 'Filter by featured status (true/false)' },
      { name: 'specialty', type: 'string', description: 'Filter by specialty area' },
      { name: 'language', type: 'string', description: 'Filter by language spoken' },
      { name: 'include_listings', type: 'boolean', description: 'Include listing counts (default: true)' },
    ],
    exampleResponse: `{
  "success": true,
  "data": [
    {
      "id": "maya-allan",
      "name": "Maya Allan",
      "title": "Licensed Real Estate Broker",
      "phone": "(646) 258-4460",
      "email": "maya@mallan.nyc",
      "bio": "Maya Allan is the founder...",
      "specialties": ["Luxury Sales", "Investment Properties"],
      "languages": ["English", "Spanish"],
      "featured": true,
      "photo": "https://mallan.nyc/images/agents/maya-allan.jpg",
      "profileUrl": "https://mallan.nyc/agents/maya-allan",
      "listings": {
        "activeSales": 1,
        "activeRentals": 1,
        "closedSales": 1,
        "closedRentals": 1,
        "total": 4
      }
    }
  ],
  "meta": {
    "total": 5,
    "timestamp": "2026-01-26T12:00:00Z",
    "version": "v1"
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/agents/{id}',
    description: 'Retrieve a single agent by ID or slug',
    parameters: [
      { name: 'id', type: 'string', description: 'Agent ID or URL slug (e.g., "maya-allan")', required: true },
      { name: 'include_listings', type: 'boolean', description: 'Include full listing details (default: true)' },
    ],
    exampleResponse: `{
  "success": true,
  "data": {
    "id": "maya-allan",
    "name": "Maya Allan",
    "title": "Licensed Real Estate Broker",
    "phone": "(646) 258-4460",
    "email": "maya@mallan.nyc",
    "bio": "Maya Allan is the founder and principal broker...",
    "specialties": ["Luxury Sales", "Investment Properties"],
    "languages": ["English", "Spanish"],
    "featured": true,
    "photo": "https://mallan.nyc/images/agents/maya-allan.jpg",
    "profileUrl": "https://mallan.nyc/agents/maya-allan",
    "listings": {
      "activeSales": [...],
      "activeRentals": [...],
      "closedSales": [...],
      "closedRentals": [...]
    }
  },
  "meta": {
    "timestamp": "2026-01-26T12:00:00Z",
    "version": "v1"
  }
}`,
  },
];

export default function APIDocsPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<number>(0);
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const testEndpoint = async (endpoint: APIEndpoint) => {
    setIsLoading(true);
    setTestResponse(null);

    try {
      const url = endpoint.path.includes('{id}')
        ? endpoint.path.replace('{id}', 'maya-allan')
        : endpoint.path;

      const response = await fetch(url);
      const data = await response.json();
      setTestResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setTestResponse(`Error: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <Link
          href="/admin"
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
        >
          ← Back to Admin
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold">API Documentation</h1>
        <p className="text-gray-600 mt-2 text-sm sm:text-base">
          Public API endpoints for sharing agent and listing information with external
          systems.
        </p>
      </div>

      {/* Base URL */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h2 className="font-semibold text-blue-800 mb-2">Base URL</h2>
        <code className="text-blue-700 text-sm break-all">{baseUrl}</code>
        <p className="text-xs sm:text-sm text-blue-600 mt-2">
          All API endpoints support CORS for cross-origin requests.
        </p>
      </div>

      {/* Endpoints List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Endpoints</h2>
            <nav className="space-y-2">
              {ENDPOINTS.map((endpoint, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedEndpoint(idx)}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    selectedEndpoint === idx
                      ? 'bg-brand-gold/10 text-brand-gold border border-brand-gold/30'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-mono mr-2 ${
                      endpoint.method === 'GET'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {endpoint.method}
                  </span>
                  <span className="font-mono text-xs break-all">{endpoint.path}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2">
          {ENDPOINTS[selectedEndpoint] && (
            <div className="bg-white border rounded-lg p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4">
                <span
                  className={`inline-block px-3 py-1 rounded text-sm font-mono w-fit ${
                    ENDPOINTS[selectedEndpoint].method === 'GET'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {ENDPOINTS[selectedEndpoint].method}
                </span>
                <code className="text-sm sm:text-base font-semibold break-all">
                  {ENDPOINTS[selectedEndpoint].path}
                </code>
              </div>

              <p className="text-gray-600 mb-4 text-sm sm:text-base">
                {ENDPOINTS[selectedEndpoint].description}
              </p>

              {/* Test Button */}
              <button
                onClick={() => testEndpoint(ENDPOINTS[selectedEndpoint])}
                disabled={isLoading}
                className="mb-6 px-4 py-2 bg-brand-gold text-white rounded hover:bg-brand-gold/90 disabled:opacity-50 text-sm"
              >
                {isLoading ? 'Testing...' : 'Test Endpoint'}
              </button>

              {/* Parameters */}
              {ENDPOINTS[selectedEndpoint].parameters && (
                <div className="mb-6">
                  <h3 className="font-semibold mb-3 text-sm sm:text-base">Parameters</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">
                            Name
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">
                            Type
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 hidden sm:table-cell">
                            Required
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {ENDPOINTS[selectedEndpoint].parameters?.map((param, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-mono text-blue-600">
                              {param.name}
                            </td>
                            <td className="px-3 py-2 text-gray-500">{param.type}</td>
                            <td className="px-3 py-2 hidden sm:table-cell">
                              {param.required ? (
                                <span className="text-red-600">Yes</span>
                              ) : (
                                <span className="text-gray-400">No</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{param.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Test Response */}
              {testResponse && (
                <div className="mb-6">
                  <h3 className="font-semibold mb-3 text-sm sm:text-base">Live Response</h3>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-xs max-h-96">
                    {testResponse}
                  </pre>
                </div>
              )}

              {/* Example Response */}
              {ENDPOINTS[selectedEndpoint].exampleResponse && (
                <div>
                  <h3 className="font-semibold mb-3 text-sm sm:text-base">Example Response</h3>
                  <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-xs">
                    {ENDPOINTS[selectedEndpoint].exampleResponse}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Usage Examples */}
      <div className="mt-6 sm:mt-8 bg-white border rounded-lg p-4 sm:p-6">
        <h2 className="font-semibold mb-4">Usage Examples</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Fetch all featured agents (JavaScript)
            </h3>
            <pre className="bg-gray-100 p-3 sm:p-4 rounded-lg overflow-x-auto text-xs">
{`fetch('${baseUrl}/api/v1/agents?featured=true')
  .then(res => res.json())
  .then(data => {
    console.log(data.data); // Array of featured agents
  });`}
            </pre>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Fetch a specific agent (cURL)
            </h3>
            <pre className="bg-gray-100 p-3 sm:p-4 rounded-lg overflow-x-auto text-xs">
{`curl -X GET "${baseUrl}/api/v1/agents/maya-allan" \\
  -H "Content-Type: application/json"`}
            </pre>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Filter by specialty (Python)
            </h3>
            <pre className="bg-gray-100 p-3 sm:p-4 rounded-lg overflow-x-auto text-xs">
{`import requests

response = requests.get(
    '${baseUrl}/api/v1/agents',
    params={'specialty': 'Brooklyn'}
)
agents = response.json()['data']`}
            </pre>
          </div>
        </div>
      </div>

      {/* Response Headers */}
      <div className="mt-6 sm:mt-8 bg-gray-50 border rounded-lg p-4 sm:p-6">
        <h2 className="font-semibold mb-3">Response Headers</h2>
        <ul className="space-y-2 text-xs sm:text-sm text-gray-600">
          <li>
            <code className="bg-gray-200 px-2 py-0.5 rounded">X-Total-Count</code> - Total
            number of items matching the query
          </li>
          <li>
            <code className="bg-gray-200 px-2 py-0.5 rounded">X-API-Version</code> - Current
            API version (v1)
          </li>
          <li>
            <code className="bg-gray-200 px-2 py-0.5 rounded">
              Access-Control-Allow-Origin
            </code>{' '}
            - CORS header (allows all origins)
          </li>
        </ul>
      </div>
    </div>
  );
}
