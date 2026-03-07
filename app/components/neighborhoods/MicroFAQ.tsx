import type { NeighborhoodFAQ } from '@/lib/types/neighborhood';

interface MicroFAQProps {
  name: string;
  faqs: NeighborhoodFAQ[];
}

export default function MicroFAQ({ name, faqs }: MicroFAQProps) {
  if (!faqs.length) return null;

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <section
      aria-label={`Frequently Asked Questions about ${name}`}
      className="py-10 sm:py-14 bg-gray-50/50"
    >
      <div className="max-w-3xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl font-display font-semibold text-brand-dark mb-6">
          {name} FAQ
        </h2>

        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <details
              key={i}
              className="group glass-card rounded-3xl"
            >
              <summary className="flex items-center justify-between gap-4 cursor-pointer px-5 py-4 text-sm sm:text-base font-medium text-brand-dark select-none">
                {faq.question}
                <span
                  aria-hidden="true"
                  className="shrink-0 text-brand-dark/75 group-open:rotate-45 transition-transform text-lg"
                >
                  +
                </span>
              </summary>
              <div className="px-5 pb-4 text-sm sm:text-base text-brand-dark/90 leading-relaxed">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* JSON-LD FAQPage schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </section>
  );
}
