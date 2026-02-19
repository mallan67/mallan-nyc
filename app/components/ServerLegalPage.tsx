interface ServerLegalPageProps {
  title: string;
  lastUpdated?: string;
  content: string;
}

function renderMarkdown(content: string): string {
  const html = content
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-8 mb-3">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .split('\n\n')
    .map(block => {
      if (block.startsWith('<') || block.trim() === '') return block;
      if (block.includes('<li')) return `<ul class="list-disc list-inside space-y-1 my-3">${block}</ul>`;
      return `<p class="my-3">${block}</p>`;
    })
    .join('\n');

  return html;
}

export default function ServerLegalPage({ title, lastUpdated, content }: ServerLegalPageProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="font-display font-bold text-2xl md:text-3xl mb-2">{title}</h1>
      {lastUpdated && (
        <p className="text-sm text-brand-dark/40 mb-8">
          Last updated: {new Date(lastUpdated).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </p>
      )}
      <div
        className="prose prose-gray max-w-none text-gray-700 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    </div>
  );
}
