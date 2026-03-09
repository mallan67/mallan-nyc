import { Metadata } from 'next';
import ServerLegalPage from '@/app/components/ServerLegalPage';
import privacyData from '@/data/pages/privacy.json';

export const revalidate = 604800;

export const metadata: Metadata = {
  title: 'Privacy Policy | Mallan Real Estate',
  description: 'How Mallan Real Estate Inc. collects, uses, and protects your personal information under the NY SHIELD Act.',
  alternates: { canonical: 'https://mallan.nyc/privacy' },
  openGraph: {
    title: 'Privacy Policy | Mallan Real Estate',
    description: 'How Mallan Real Estate Inc. collects, uses, and protects your personal information under the NY SHIELD Act.',
    url: 'https://mallan.nyc/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <main className="pt-20">
        <ServerLegalPage
          title={privacyData.title}
          lastUpdated={privacyData.lastUpdated}
          content={privacyData.content}
        />
      </main>
    </div>
  );
}
