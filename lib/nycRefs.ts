// ACRIS / DOB / DOF deep links based on BBL/BIN
export const acrisUrl = (bbl?: string) =>
  bbl
    ? `https://a836-acris.nyc.gov/DS/DocumentSearch/BBLResult?bbl=${encodeURIComponent(bbl)}`
    : `https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentType?`;

export const dobUrl = (bin?: string) =>
  bin
    ? `https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?bin=${encodeURIComponent(bin)}`
    : `https://www.nyc.gov/site/buildings/index.page`;

export const dofUrl = (bbl?: string) => {
  if (!bbl) return "https://www.nyc.gov/site/finance/taxes/property.page";
  const boro = bbl.slice(0, 1);
  const block = bbl.slice(1, 6);
  const lot = bbl.slice(6);
  return `https://a836-pts-access.nyc.gov/care/datalets/datalet.aspx?mode=sbldg&search=BBL&bk=${block}&lot=${lot}&boro=${boro}`;
};
