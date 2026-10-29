/// <reference types="jest" />
/**
 * Client email convergence (2026-10-27, Maya: "the email to clients are there but not connected
 * correctly … converge, make sure there are no other crms forms").
 *
 * One client-send pathway: POST /api/crm/email (consent gate, unsubscribe suppression, 200-recipient
 * cap, audit `email:sent` per recipient). Found:
 *   - the Communications panel's Compose Email / SMS / eBlast posted a record-shaped body to
 *     /api/crm/communications, whose inline copy of the sender resolved recipients from
 *     `client_ids` / `recipient_emails` only → nothing was ever sent while the panel said "sent";
 *   - seven dashboard buttons ("Email", "Contact", "Respond", "Send Buy vs Rent", "Buy vs Rent")
 *     were bare mail-app links: no content, no record, no consent check;
 *   - "Send weekly report" / "Send sale comps" posted three canned lines to the client at once.
 */

import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const panels = read('public/crm/js/dashboard/panels.js');
const workspace = read('public/crm/js/dashboard/workspace.js');
const rentals = read('public/crm/js/dashboard/panels/rentals-crm/index.js');
const sales = read('public/crm/js/dashboard/panels/sales-crm/index.js');
const tracker = read('public/crm/js/dashboard/panels/lease-tracker.js');
const comms = read('app/api/crm/communications/route.ts');
const emailRoute = read('app/api/crm/email/route.ts');

describe('one client-send pathway', () => {
  it('/api/crm/communications POST is the /api/crm/email handler, not a second sender', () => {
    expect(comms).toContain('export { POST } from "@/app/api/crm/email/route";');
    expect(comms).not.toMatch(/doSend\(|sendEmail\(/);
    expect(comms).not.toMatch(/body\.recipient_emails|body\.client_ids/);
  });

  it('the canonical sender separates correspondence, bulk and SMS, keeps the recipient cap and audits every state per recipient', () => {
    expect(emailRoute).toContain('export const MAX_RECIPIENTS = 200;');
    expect(emailRoute).toContain('export function sendKind(');
    // consent gates bulk and SMS only — never individual correspondence
    expect(emailRoute).toContain('if (kind === "bulk" && !client.consent_captured_at)');
    expect(emailRoute).toContain('if (!client.consent_captured_at) {\n        await audit("sms:blocked"');
    expect(emailRoute).not.toMatch(/kind === "correspondence" && !client\.consent_captured_at/);
    for (const a of ['"email:sent"', '"email:suppressed"', '"email:failed"', '"email:blocked"', '"sms:sent"', '"sms:logged"', '"sms:failed"', '"sms:blocked"']) expect(emailRoute).toContain(a);
  });

  it('Compose Email, Compose SMS and eBlast post client_ids to the pipeline and report per-recipient results', () => {
    const submitEmail = panels.slice(panels.indexOf('function _submitEmail'), panels.indexOf('function _commsReportSendResult'));
    expect(submitEmail).toContain('MallanAPI.email.send({');
    expect(submitEmail).toContain('client_ids: recipientIds.map(String)');
    expect(submitEmail).toContain("type: threadId ? 'reply' : 'email'");
    expect(submitEmail).not.toContain("'/api/crm/communications'");
    expect(submitEmail).toContain('_commsReportSendResult(res, recipientNames');
    const submitSms = panels.slice(panels.indexOf('function _submitSMS'), panels.indexOf('function _composeBulk'));
    expect(submitSms).toContain("MallanAPI.email.send({ type: 'sms', client_ids: [String(recipient.id)], body: body })");
    expect(submitSms).not.toContain("'/api/crm/communications'");
    const submitEblast = panels.slice(panels.indexOf('function _submitEblast'), panels.indexOf('// ─── Deals & Commissions'));
    expect(submitEblast).toContain("MallanAPI.email.send({ type: 'eblast', client_ids: ids, subject: subject, body: body })");
    expect(submitEblast).toContain('filtered.length > 200');
    expect(submitEblast).not.toContain("'/api/crm/communications'");
    // The report helper shows the actual state per recipient and never claims "sent" from an audit row
    const report = panels.slice(panels.indexOf('function _commsReportSendResult'), panels.indexOf('function _composeTo'));
    expect(report).toContain("x.state === 'delivered_to_provider'");
    expect(report).toContain("delivered to the mail provider for");
    for (const s of ['suppressed_unsubscribed', 'blocked_no_consent', 'blocked_no_address', 'logged_only', "'failed'"]) expect(report).toContain(s);
    expect(report).not.toMatch(/toast\(what \+ ' sent to '/);
    expect(submitSms).toContain("r.state === 'logged_only'");
    expect(submitSms).toContain('no SMS provider configured; nothing was delivered');
  });

  it('no dashboard client action is a mail-app link any more', () => {
    for (const [name, src] of [['panels.js', panels], ['workspace.js', workspace], ['rentals-crm', rentals], ['sales-crm', sales], ['lease-tracker', tracker]] as const) {
      expect({ file: name, mailto: (src.match(/mailto:/g) || []).length }).toEqual({ file: name, mailto: 0 });
    }
    expect(panels).toContain("onclick=\"event.stopPropagation();Panels._composeTo(\\'' + E(cl.id) + '\\',\\'\\')\"");
    // The unreachable second "Lease Tracking" panel (mail-app Buy vs Rent / Contact buttons) is gone;
    // the Rentals CRM tenants list carries the Rent vs Buy action through the one pathway.
    expect(panels).not.toContain('function leaseTracking(');
    expect(panels).not.toContain('leaseTracking: leaseTracking');
    expect(rentals).toContain("RentalsCRM._buyVsRent(\\'' + E(String(r.id))");
    expect(rentals).toContain('function _buyVsRent(clientId, name) { Panels._sendBuyVsRent(clientId, name); }');
    expect(workspace).toMatch(/Panels\._composeTo\(\\'' \+ E\(cl\.id\)/);
    expect(workspace).toMatch(/Panels\._composeToEmail\(\\'' \+ E\(email\)/);
  });

  it('the compose helpers pre-select the client and the Buy vs Rent action uses the Lease Tracker preview when a tenancy exists', () => {
    const composeTo = panels.slice(panels.indexOf('function _composeTo'), panels.indexOf('function _composeToEmail'));
    expect(composeTo).toContain('_commsSelectedRecipients = [cl]');
    expect(composeTo).toContain("_openComposeModal(null, null, subject || '')");
    const byEmail = panels.slice(panels.indexOf('function _composeToEmail'), panels.indexOf('function _sendBuyVsRent'));
    expect(byEmail).toContain('use Create Client first, then Respond');
    const bvr = panels.slice(panels.indexOf('function _sendBuyVsRent'), panels.indexOf('// ── Compose SMS'));
    expect(bvr).toContain("LeaseTracker.previewFor(hit.id, 'tenant', 'buy_inquiry')");
    expect(bvr).toContain("'Rent vs Buy — Cost to Become an Owner'");
    expect(tracker).toContain('function previewFor(leaseId, target, type)');
    expect(tracker).toContain('previewFor: previewFor,');
    expect(panels).toContain('_composeTo: _composeTo,');
    expect(panels).toContain('_sendBuyVsRent: _sendBuyVsRent,');
  });

  it('"weekly report" and "sale comps" open a reviewed draft instead of sending canned lines at once', () => {
    expect(rentals).not.toMatch(/type: 'weekly_report'|type: 'sale_comps'/);
    expect(sales).not.toMatch(/type: 'weekly_report'/);
    expect(rentals).toContain("Panels._composeTo(cl.id, rptSubject, rptBody)");
    expect(rentals).toContain("Panels._composeTo(cl.id, 'Sale Comps for Your Property — '");
    expect(sales).toContain("Panels._composeTo(cl.id, rptSubject, rptBody)");
  });

  it('no second CRM document: the unreferenced dev shell is gone and the served documents are the known set', () => {
    expect(fs.existsSync(path.join(root, 'public/crm/dev.html'))).toBe(false);
    const docs = fs.readdirSync(path.join(root, 'public/crm')).filter((f) => f.endsWith('.html')).sort();
    expect(docs).toEqual([
      'BUYER-DEAL-FORM.html', 'RENTAL-FORM-REDESIGN.html', 'RENTAL-FORM-WITH-TOOLS.html', 'SALE-FORM-REDESIGN.html',
      'SALE-FORM-WITH-TOOLS.html', 'TENANT-DEAL-FORM.html', 'dashboard.html', 'index-built.html', 'index.html', 'login.html',
    ]);
  });
});
