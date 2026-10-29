/// <reference types="jest" />
/**
 * The lease-expiring automation told the agent it had sent "no-fee rentals", and its default rule carried an
 * `include_no_fee` flag. Nothing in the repository reads `include_no_fee` (or any other `include_*` flag of the
 * rule), and no live Cotality field says who pays the broker fee (see the "No Fee" decision in the Execution State),
 * so nothing could make the sentence true. The copy now says only what the rule does, and the dead flag is gone.
 *
 * The notification text is private to lib/lifecycle/engine.ts, so these are source-level pins on the shipped file.
 */
import fs from 'fs';
import path from 'path';

const engine = fs.readFileSync(path.resolve(__dirname, '../../lib/lifecycle/engine.ts'), 'utf8');

describe('lease-expiring copy and rule', () => {
  it('the 90-day notification does not claim no-fee rentals were sent', () => {
    expect(engine).not.toMatch(/no-fee rentals/i);
    // a lease milestone is an agent checkpoint (crm_task): nothing is sent to the client by the engine (owner rule: no automatic client e-mail)
    expect(engine).toContain("lease ends in ~90 days. Confirm renewal, move or sale plans; preview and send any outreach from the Lease Tracker. Nothing has been sent.");
    expect(engine).toContain('Lease expires in ~90 days — review (nothing sent)');
  });

  it('no default rule carries include_no_fee', () => {
    expect(engine).not.toContain('include_no_fee');
  });

  it('the 90-day rule still asks for sale and rental listings', () => {
    expect(engine).toMatch(/trigger_type: 'lease_expiring_90d',[\s\S]*?action_type: 'crm_task',[\s\S]*?action_config: \{ suggest_sale_listings: true, suggest_rental_listings: true \},/);
  });
});

// Module scope: without a top-level import/export TypeScript treats this file as a global script.
export {};
