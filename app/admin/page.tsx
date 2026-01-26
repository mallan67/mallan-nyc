import Link from 'next/link';

export default function AdminHome() {
  const sections = [
    {
      title: 'Listings & Properties',
      links: [
        { href: '/admin/listings', label: 'Listings Management', description: 'Import listings via CSV, manage properties' },
        { href: '/admin/open-houses', label: 'Open Houses', description: 'Manage open house listings' },
      ],
    },
    {
      title: 'Content Management',
      links: [
        { href: '/admin/pages', label: 'Pages', description: 'Edit About Us & Legal pages' },
        { href: '/admin/resources', label: 'Resource Guides', description: 'Edit Buyer/Seller/Investor guides' },
        { href: '/admin/team', label: 'Team', description: 'Manage agent profiles' },
      ],
    },
    {
      title: 'CRM & Data',
      links: [
        { href: '/admin/agents', label: 'Agent Summaries', description: 'View CRM agent data' },
        { href: '/admin/splits', label: 'Agent Splits', description: 'Update agent/year splits' },
      ],
    },
    {
      title: 'Settings',
      links: [
        { href: '/admin/settings', label: 'Company Settings', description: 'Edit company info, hero, footer links' },
      ],
    },
    {
      title: 'Developer & API',
      links: [
        { href: '/admin/api-docs', label: 'API Documentation', description: 'Public API endpoints for agent data' },
      ],
    },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-8">Admin Dashboard</h1>

      <div className="space-y-8">
        {sections.map((section, index) => (
          <div key={index}>
            <h2 className="text-lg font-medium text-gray-700 mb-4">{section.title}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {section.links.map((link, linkIndex) => (
                <Link
                  key={linkIndex}
                  href={link.href}
                  className="block p-4 bg-white border rounded-lg hover:shadow-md hover:border-brand-gold/50 transition-all"
                >
                  <h3 className="font-semibold text-brand-dark">{link.label}</h3>
                  <p className="text-sm text-gray-500 mt-1">{link.description}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 pt-6 border-t text-sm text-gray-500">
        Data sources &amp; last updated: visible on each page.
      </div>
    </div>
  );
}
