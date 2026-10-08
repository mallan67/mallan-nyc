/// <reference types="jest" />
/**
 * The sidebar of the Tools viewers (agent backend viewers: SALE-FORM-WITH-TOOLS, RENTAL-FORM-WITH-TOOLS).
 *
 * The viewers are the Add forms' pages with the boxes switched off. Their sidebar still carried an Add form's "Required" switch (which marks the boxes the form requires: a viewer has no boxes to fill) and
 * its validation summary, which said "All fields OK" whatever the listing held. A viewer shows a record; it does not check one, so both are hidden (as the required stars and the validation panel
 * already are). The Add forms keep them.
 */
import { bootViewer, rendered, sleep, until, type ViewerFile } from './tools-viewer-harness';
import { bootAddForm, sleep as addSleep } from './add-form-harness';

jest.setTimeout(120000);

describe.each([
  ['RENTAL-FORM-WITH-TOOLS', 'RENTAL-FORM-REDESIGN', 'rental', 'RL-0404'],
  ['SALE-FORM-WITH-TOOLS', 'SALE-FORM-REDESIGN', 'sale', 'SL-0404'],
] as const)('%s', (viewer, addForm, prefix, lid) => {
  it('hides the Required switch and the validation summary', async () => {
    const b = bootViewer(viewer as ViewerFile, { search: `?id=${lid}`, listing: { id: '404', listing_id: lid, status: 'Active', raw_data: {} } });
    try {
      await until(() => rendered(b.d), 15000);
      await sleep(200);
      const toggle = b.d.getElementById(`${prefix}ShowRequiredOnly`) as HTMLElement;
      const summary = b.d.getElementById(`${prefix}ValidationSummary`) as HTMLElement;
      expect(toggle).not.toBeNull();
      expect(summary).not.toBeNull();
      expect(toggle.closest('div.border-t')!.classList.contains('viewer-hidden')).toBe(true);
      expect(summary.closest('div.border-t')!.classList.contains('viewer-hidden')).toBe(true);
      expect(toggle.closest('div.border-t')).not.toBe(summary.closest('div.border-t'));        // each has its own block
      expect([...b.d.querySelectorAll('aside .sidebar-tab')].some((tab) => tab.closest('.viewer-hidden'))).toBe(false);          // the tabs are not in a hidden block
      expect(b.errors).toEqual([]);
    } finally { b.close(); }
  });

  it('still has the Required switch and the summary in the Add form, unhidden', async () => {
    const f = await bootAddForm(addForm, { settle: 600 });
    try {
      const toggle = f.d.getElementById(`${prefix}ShowRequiredOnly`) as HTMLElement;
      const summary = f.d.getElementById(`${prefix}ValidationSummary`) as HTMLElement;
      expect(toggle.closest('div.border-t')!.classList.contains('viewer-hidden')).toBe(false);
      expect(summary.closest('div.border-t')!.classList.contains('viewer-hidden')).toBe(false);
    } finally { await addSleep(100); f.close(); }
  });
});
