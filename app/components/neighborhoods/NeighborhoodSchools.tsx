import { DOE_SCHOOL_SEARCH_URL, SCHOOL_SOURCE, schoolRecordsUpdatedLabel, schoolsForZipCodes } from '@/lib/neighborhoods/schools';

interface NeighborhoodSchoolsProps {
  zipCodes: readonly string[];
}

/** A long list is collapsed behind a summary; the full list stays in the page either way. */
const COLLAPSE_ABOVE = 15;

function zipPhrase(zipCodes: readonly string[]): string {
  if (zipCodes.length === 1) return `ZIP code ${zipCodes[0]}`;
  return `ZIP codes ${zipCodes.slice(0, -1).join(', ')}${zipCodes.length > 2 ? ',' : ''} and ${zipCodes[zipCodes.length - 1]}`;
}

/**
 * Schools and Education. Facts only: a list by ZIP code from one named public record, the same wording and the same
 * selection rule on every guide, no ranking or quality claim, no statement about who a place or a school is for.
 * Master 21.12 / 21.11 / 23.10; guarded by tests/runtime/neighborhood-schools.test.ts.
 */
export default function NeighborhoodSchools({ zipCodes }: NeighborhoodSchoolsProps) {
  const schools = schoolsForZipCodes(zipCodes);
  const count = schools.length;
  const multiZip = zipCodes.length > 1;

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm sm:text-base text-brand-dark/90">
        <caption className="sr-only">Public and charter schools with an address in {zipPhrase(zipCodes)}</caption>
        <thead>
          <tr className="border-b border-brand-dark/15">
            <th scope="col" className="py-2 pr-4 font-semibold">School</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Address</th>
            {multiZip && <th scope="col" className="py-2 pr-4 font-semibold">ZIP code</th>}
            <th scope="col" className="py-2 pr-4 font-semibold">Level</th>
            <th scope="col" className="py-2 font-semibold">Type</th>
          </tr>
        </thead>
        <tbody>
          {schools.map((s) => (
            <tr key={s.id} className="border-b border-brand-dark/10 align-top">
              <th scope="row" className="py-2 pr-4 font-normal">{s.name}</th>
              <td className="py-2 pr-4">{s.address}</td>
              {multiZip && <td className="py-2 pr-4">{s.zip}</td>}
              <td className="py-2 pr-4">{s.level || 'Not listed'}</td>
              <td className="py-2">{s.sector === 'charter' ? 'Charter' : 'Public'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section aria-labelledby="schools-and-education" data-section="schools-and-education" className="py-10 sm:py-14 bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4">
        <h2 id="schools-and-education" className="text-2xl sm:text-3xl font-display font-semibold text-brand-dark mb-3">
          Schools and Education
        </h2>
        <p className="text-brand-dark/90 mb-5 max-w-3xl">
          {count > 0
            ? `The NYC Department of City Planning Facilities Database lists ${count} public and charter ${count === 1 ? 'school' : 'schools'} with an address in ${zipPhrase(zipCodes)}.`
            : `The NYC Department of City Planning Facilities Database lists no public or charter schools with an address in ${zipPhrase(zipCodes)}.`}
        </p>

        {count > COLLAPSE_ABOVE ? (
          <details className="mb-5">
            <summary className="cursor-pointer font-medium text-brand-dark mb-3">Show all {count} schools</summary>
            {table}
          </details>
        ) : count > 0 ? (
          <div className="mb-5">{table}</div>
        ) : null}

        <p className="text-sm sm:text-base text-brand-dark/90 mb-2 max-w-3xl">
          This is a list by ZIP code, not by attendance zone. To find the school zoned for a specific address, use the{' '}
          <a href={DOE_SCHOOL_SEARCH_URL} target="_blank" rel="noopener noreferrer" className="underline">
            NYC Department of Education school search
          </a>
          .
        </p>
        <p className="text-xs sm:text-sm text-brand-dark/75 max-w-3xl">
          Source: {SCHOOL_SOURCE.publisher} {SCHOOL_SOURCE.dataset}, records updated {schoolRecordsUpdatedLabel()}. Non-public schools are not included, and the record may not list every school.
        </p>
      </div>
    </section>
  );
}
