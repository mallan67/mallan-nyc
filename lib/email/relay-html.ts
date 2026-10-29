// HTML an agent composed in the CRM (a Search report) and the server relays by e-mail: it is kept as composed — the report builder
// (public/crm/js/output/reports.js) escapes every listing text it writes — but the server never relays active content. Mail clients do
// not run scripts; what is stripped here is what would run if the same HTML were ever shown in a browser (a saved copy, a preview pane).

const SCRIPT_BLOCKS = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const EVENT_HANDLER_ATTRIBUTES = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_URLS = /(\s(?:href|src|action|formaction)\s*=\s*)(["']?)\s*javascript:[^"'>\s]*/gi;

/** The relayed HTML without script blocks, inline event handlers and javascript: addresses. Text and markup that carry no code are unchanged. */
export function stripActiveContent(html: string): string {
  return String(html)
    .replace(SCRIPT_BLOCKS, '')
    .replace(EVENT_HANDLER_ATTRIBUTES, '')
    .replace(SCRIPT_URLS, (_m, attr: string, quote: string) => `${attr}${quote}#`);
}
