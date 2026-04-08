'use client';

import { useGsapReveal } from '@/lib/hooks/useGsapReveal';

interface Value {
  title: string;
  description: string;
}

export default function ValuesGrid({ values }: { values: Value[] }) {
  const ref = useGsapReveal<HTMLDivElement>({ children: true, y: 50, scale: 0.97 });

  return (
    <section className="py-16">
      <div className="max-w-5xl mx-auto px-4">
        <h2 className="text-xl md:text-2xl font-display font-semibold mb-10 text-center">Our Values</h2>
        <div ref={ref} className="grid md:grid-cols-2 gap-8">
          {values.map((value, index) => (
            <div key={index} className="glass-card rounded-3xl p-8">
              <h3 className="text-xl font-display font-semibold mb-3 text-brand-dark">
                {value.title}
              </h3>
              <p className="text-brand-dark/90 leading-relaxed">{value.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
