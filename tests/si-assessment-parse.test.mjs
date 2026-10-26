// Sick & Injured: carrying the Assessment forward from the previous note. Pulls the real functions out of
// sick-injured.html and runs them. Fictional animals only.   node --test tests/si-assessment-parse.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sick-injured.html'), 'utf8');
const a = html.indexOf('function parseNoteSections'), b = html.indexOf('/* Vet sign-off initials (e.g. "ADL") appear as a short standalone');
const k = html.indexOf('const MEDICATION_KEYWORDS'), e = html.indexOf('/* ---------- init top bar');
const d = html.indexOf('/* ---------- Assessment: previous note -> problem list');
const P = new Function(html.slice(a, d) + html.slice(d, b) + html.slice(k, e) +
  '; return {parseNoteSections, splitAssessmentLines, splitAssessmentAndMeds, problemFromLine};')();
const probs = t => P.splitAssessmentAndMeds(P.parseNoteSections(t).assessment).assessmentLines.map(P.problemFromLine).map(({ text, ddx }) => ({ text, ddx }));

test('a "Medications:" mention in the History no longer pulls Treatment / Fees into Assessment', () => {
  const note = `Date: 20/10/2026
Reason / History:
Recheck. Medications: nil. On treatment: gabapentin since Friday.
Examination: BAR Eating 0/3, Urinating: Yes, Defecating 0/7 In FIR with covering over door.
Assessment: SS
Treatment / Fees: Start gabapentin 200mg/mL (20.3mg/kg) 0.3mL
PO BID.
Pathway / Plan / Waivers: R/C 26/10 to ensure coping with meds.
PL`;
  const s = P.parseNoteSections(note);
  assert.match(s.reasonHistory, /On treatment: gabapentin since Friday/);
  assert.equal(s.assessment, 'SS');
  assert.match(s.treatment, /Start gabapentin 200mg\/mL \(20\.3mg\/kg\) 0\.3mL\s+PO BID\./);
  assert.match(s.pathway, /^R\/C 26\/10/);
  assert.deepEqual(probs(note), [{ text: 'SS', ddx: '' }]);
});

test('a Treatment label left inside Assessment is cut off even if the header was not found in order', () => {
  const s = P.parseNoteSections('Assessment:\n1. SS\nTreatment / Fees: Start gabapentin 100mg BID');
  assert.equal(s.assessment, '1. SS'); assert.match(s.treatment, /gabapentin 100mg BID/);
});

test('numbered problems keep their DDx together, however it wraps (new lines, new paragraph, long "vs" chains)', () => {
  const t = `1. FURI: ddx FHV vs FCV vs
chlamydia vs mycoplasma vs others.

Mild SS, eating.
2. ocular d/c bilaterally: ddx conjunctivitis vs secondary to FURI vs others.
3. 2.5 kg weight loss since intake — DDx: poor intake
Additional notes: recheck BCS`;
  assert.deepEqual(P.splitAssessmentAndMeds(t).assessmentLines.map(P.problemFromLine).map(({ text, ddx }) => ({ text, ddx })), [
    { text: 'FURI', ddx: 'FHV vs FCV vs chlamydia vs mycoplasma vs others. Mild SS, eating.' },
    { text: 'ocular d/c bilaterally', ddx: 'conjunctivitis vs secondary to FURI vs others.' },
    { text: '2.5 kg weight loss since intake', ddx: 'poor intake' }]);
});

test('numbers keep their order when the note is written out and read back in', () => {
  const list = [{ text: 'FURI', ddx: 'FHV vs FCV vs others.' }, { text: 'Ocular d/c bilaterally', ddx: 'conjunctivitis vs secondary to FURI.' }, { text: 'Dental grade 2/4', ddx: '' }];
  const written = list.map((p, i) => `${i + 1}. ${p.ddx ? `${p.text} — DDx: ${p.ddx}` : p.text}`).join('\n');
  assert.deepEqual(probs('Assessment:\n' + written + '\nTreatment / Fees:\n-'), list);
  assert.deepEqual(probs('Assessment:\n1. Dental grade 2/4\nTreatment / Fees:\n-'), [{ text: 'Dental grade 2/4', ddx: '' }]);   // a single problem is numbered too
});

test('old notes with no numbers: wrapped DDx lines rejoin and the DDx sits in the DDx field', () => {
  const t = `L eye mild epiphora with tear staining — resolved —
DDx: FHV-1 vs feline calicivirus vs
Chlamydophila felis vs conjunctivitis vs corneal disease.
Dental grade 1/4 — mild gingivitis — DDx:
periodontal disease secondary to plaque/calculus vs endodontic disease.
FSA 4 - mild improvement`;
  const r = P.splitAssessmentAndMeds(t).assessmentLines.map(P.problemFromLine);
  assert.equal(r.length, 3);
  assert.equal(r[0].ddx, 'FHV-1 vs feline calicivirus vs Chlamydophila felis vs conjunctivitis vs corneal disease.');
  assert.deepEqual([r[1].text, r[2].text], ['Dental grade 1/4 — mild gingivitis', 'FSA 4 - mild improvement']);
});

test('resolved problems are not carried forward; a drug in the DDx does not pull the problem out; medication lines go to Treatment', () => {
  const r = P.splitAssessmentAndMeds(`1. Dental grade 2/4 — DDx: periodontal disease vs doxy-responsive gingivitis.\n2. Vomiting — resolved this visit\n3. gabapentin 100mg BID`);
  assert.equal(r.assessmentLines.length, 1); assert.equal(r.resolvedDropped, 1); assert.deepEqual(r.medLines, ['gabapentin 100mg BID']);
});
