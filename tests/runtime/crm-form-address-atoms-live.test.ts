/// <reference types="jest" />
/**
 * The street atoms the two Add forms send are members of the live Cotality lists: StreetDirPrefix is a StreetDirection (E, EW, N, NE, NS, NW, S, SE, SW, W), StreetSuffix a StreetSuffix (Street, Avenue, ...).
 *
 * Found 2026-10-09 by an independent read-only review of the emitted-values audit, and confirmed against the mirror (data/cotality-enums.live.json): the address parser of both forms kept the words as the agent
 * typed them, so "123 East 57th Street" sent StreetDirPrefix "East" and "10 W 57th St" sent StreetSuffix "St", neither of which is a member of the live list. The audit that was meant to find that kind of error
 * never typed an address (it sets controls) and read only enumerations keyed by the field's own name (StreetDirPrefix is typed StreetDirection). The parser now stores the member: the long direction words
 * become the letters and the abbreviated suffixes the whole words. A long direction word that is not followed by a number ("West End Avenue", "North Moore Street") belongs to the street's name and stays
 * in it, as Cotality has it. A listing already saved keeps the atoms it was saved with until its street is typed again.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, sleep, type AddForm } from './add-form-harness';

jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const live: { entities: { Property: Record<string, string> }; enums: Record<string, string[]> } = JSON.parse(readFileSync(resolve(__dirname, '../../data/cotality-enums.live.json'), 'utf8'));
const enumOf = (field: string): string[] => live.enums[field] ?? live.enums[String(live.entities.Property[field]).replace(/^.*\.Enums\./, '')] ?? [];

const PAGES = [['SALE-FORM-REDESIGN', 'sale', 'parseSaleAddress', 'collectSaleFormData'], ['RENTAL-FORM-REDESIGN', 'rental', 'parseRentalAddress', 'collectRentalFormData']] as const;

// typed street  ->  [StreetNumber, StreetDirPrefix, StreetName, StreetSuffix]
const TYPED: Array<[string, string, string, string, string]> = [
  ['333 E 46th St', '333', 'E', '46th', 'Street'],
  ['333 East 46th Street', '333', 'E', '46th', 'Street'],
  ['10 West 57th St', '10', 'W', '57th', 'Street'],
  ['1 North 6th Street', '1', 'N', '6th', 'Street'],
  ['25 South 4th Ave', '25', 'S', '4th', 'Avenue'],
  ['400 NE 5th Blvd', '400', 'NE', '5th', 'Boulevard'],
  ['20 W 20th Pl', '20', 'W', '20th', 'Place'],
  ['245 West End Avenue', '245', '', 'West End', 'Avenue'],           // "West End" is the name of the street
  ['170 East End Ave', '170', '', 'East End', 'Avenue'],
  ['1 North Moore Street', '1', '', 'North Moore', 'Street'],
  ['88 Central Park West', '88', '', 'Central Park West', ''],
  ['100 Broadway', '100', '', 'Broadway', ''],
  ['5 Park Ave', '5', '', 'Park', 'Avenue'],
  ['1 Riverside Dr', '1', '', 'Riverside', 'Drive'],
  ['120 Lexington Avenue', '120', '', 'Lexington', 'Avenue'],
  ['35 Hudson Yards Plz', '35', '', 'Hudson Yards', 'Plaza'],
];
const DIRECTIONS = ['North', 'South', 'East', 'West', 'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];
const SUFFIXES = ['Street', 'St', 'Avenue', 'Ave', 'Boulevard', 'Blvd', 'Road', 'Rd', 'Drive', 'Dr', 'Place', 'Pl', 'Court', 'Ct', 'Lane', 'Ln', 'Way', 'Terrace', 'Ter', 'Circle', 'Cir', 'Parkway', 'Pkwy', 'Plaza', 'Plz', 'Alley'];

describe('the live lists the atoms are held to', () => {
  it('StreetDirPrefix is a StreetDirection (letters) and StreetSuffix a StreetSuffix (whole words); the guard is not vacuous', () => {
    expect(enumOf('StreetDirPrefix')).toEqual(['E', 'EW', 'N', 'NE', 'NS', 'NW', 'S', 'SE', 'SW', 'W']);
    expect(enumOf('StreetSuffix')).toEqual(expect.arrayContaining(['Street', 'Avenue', 'Boulevard', 'Place', 'Plaza', 'Alley']));
    expect(enumOf('StreetSuffix')).not.toContain('St');
  });
});

describe.each(PAGES)('%s: the parsed atoms are members of the live lists', (form, prefix, parse, collect) => {
  /** types the street, runs the page's parser, and reads the atoms back from the boxes and from the body the collector builds */
  async function parsed(f: Awaited<ReturnType<typeof bootAddForm>>, typed: string) {
    (f.d.getElementById(`${prefix}StreetAddress`) as HTMLInputElement).value = typed;
    f.w[parse]();
    const box = (id: string) => (f.d.getElementById(`${prefix}${id}`) as HTMLInputElement).value;
    const atoms = [box('StreetNumber'), box('StreetDirPrefix'), box('StreetName'), box('StreetSuffix')];
    const body = f.w[collect]();
    return { atoms, sent: [body.StreetNumber, body.StreetDirPrefix, body.StreetName, body.StreetSuffix] };
  }

  it.each(TYPED)('"%s"', async (typed, number, dir, name, suffix) => {
    const f = await bootAddForm(form as AddForm, { settle: 300 });
    try {
      const { atoms, sent } = await parsed(f, typed);
      expect(atoms).toEqual([number, dir, name, suffix]);
      expect(sent).toEqual([number, dir, name, suffix]);
      if (dir) expect(enumOf('StreetDirPrefix')).toContain(dir);
      if (suffix) expect(enumOf('StreetSuffix')).toContain(suffix);
    } finally { f.close(); }
  });

  it('every direction word and every suffix word the parser recognizes ends up as a live member', async () => {
    const f = await bootAddForm(form as AddForm, { settle: 300 });
    try {
      const notMembers: string[] = [];
      for (const dir of DIRECTIONS) {
        const { atoms } = await parsed(f, `7 ${dir} 5th Street`);
        if (atoms[1] && !enumOf('StreetDirPrefix').includes(atoms[1])) notMembers.push(`${dir} -> StreetDirPrefix ${atoms[1]}`);
        if (!atoms[1]) notMembers.push(`${dir} -> no prefix`);                 // before a number, every direction word is the prefix
      }
      for (const word of SUFFIXES) {
        const { atoms } = await parsed(f, `7 Main ${word}`);
        if (!enumOf('StreetSuffix').includes(atoms[3])) notMembers.push(`${word} -> StreetSuffix ${atoms[3]}`);
        for (const typed of [word.toLowerCase(), word.toUpperCase()]) {
          const again = await parsed(f, `7 Main ${typed}`);
          if (!enumOf('StreetSuffix').includes(again.atoms[3])) notMembers.push(`${typed} -> StreetSuffix ${again.atoms[3]}`);
        }
      }
      expect(notMembers).toEqual([]);
      await sleep(10);
    } finally { f.close(); }
  });

  it('typing a street again replaces the atoms (a street with no direction or suffix clears them)', async () => {
    const f = await bootAddForm(form as AddForm, { settle: 300 });
    try {
      expect((await parsed(f, '333 East 46th Street')).atoms).toEqual(['333', 'E', '46th', 'Street']);
      expect((await parsed(f, '100 Broadway')).atoms).toEqual(['100', '', 'Broadway', '']);
    } finally { f.close(); }
  });
});
