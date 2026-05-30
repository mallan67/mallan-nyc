/// <reference types="jest" />
/**
 * Syndication restore — checkbox must match against SyndicateTo targets,
 * not blindly check all when array is non-empty.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const FORM_PATH = path.resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const src = readFileSync(FORM_PATH, 'utf-8');

describe('Syndication checkbox restore', () => {
  test('does NOT use checked=true unconditionally inside syndication loop', () => {
    const syndBlock = src.match(/SALE_SYNDICATION_MAP\.forEach[\s\S]*?\}\);/);
    expect(syndBlock).not.toBeNull();
    expect(syndBlock![0]).not.toMatch(/el\.checked\s*=\s*true/);
  });

  test('compares against normalizedTargets with .includes()', () => {
    expect(src).toMatch(/normalizedTargets\.includes\(entry\.target\.toLowerCase\(\)\)/);
  });

  test('saleSendToAll only checked when all individual targets present', () => {
    // Cotality-clean sweep 2026-05-30: restore matches against the canonical
    // Cotality member (entry.cotality) / internal / legacy target via syndMatches.
    expect(src).toMatch(/SALE_SYNDICATION_MAP\.every/);
    expect(src).toMatch(/setChecked\('saleSendToAll',\s*SALE_SYNDICATION_MAP\.every\(syndMatches\)\)/);
  });

  test('SALE_SYNDICATION_MAP has target names for each checkbox', () => {
    expect(src).toMatch(/SALE_SYNDICATION_MAP/);
    expect(src).toMatch(/target:\s*'Listhub'/);
    expect(src).toMatch(/target:\s*'RLS'/);
    expect(src).toMatch(/target:\s*'Realtor'/);
  });
});
