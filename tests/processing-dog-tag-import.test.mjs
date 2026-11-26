// Processing import: dogs are identified by their shelter tag, cats by the Animal ID (2026-11-26). Fictional animals only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'processing.html'), 'utf8');
const a = html.indexOf('const DOG_TAG_RE'), b = html.indexOf('function parseInCareInventory');
const dogTagIn = new Function(html.slice(a, b) + '; return dogTagIn;')();

test('a tag column is read', () => assert.equal(dogTagIn(['1180001', 'Rex', 'czu627'], { animalid: 0, name: 1, sheltertag: 2 }), 'CZU627'));
test('without a tag column, a tag anywhere in the row is found (e.g. as the name)', () => assert.equal(dogTagIn(['1180001', 'CZU 628', 'Pound 2 / 4'], { animalid: 0, animalname: 1 }), 'CZU628'));
test('kennels, shelter numbers and ordinary names are not tags', () => assert.equal(dogTagIn(['1180001', 'Bella', 'Pound 2 / 4', 'CR2-43', '956000012345678'], { animalid: 0 }), ''));
test('the dog rule is applied on import and cats keep the Animal ID', () => assert.match(html, /species==='dog' \? \(dogTagIn\(row, colMap\) \|\| shelterId\) : shelterId/));
