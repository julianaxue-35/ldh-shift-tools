/*
  LDH Shift Tools — dental chart logic (no page code here, so it can be tested on its own).
  Copyright (c) 2026 Juliana Xue. All rights reserved. Licensed to her current employer for use only while she is engaged there.

  A chart is saved on the device only (nothing goes to the dashboard):
    { surgId, animalId, species: 'canine' | 'feline', grade: '0'..'4' | '', desc, procedure: 'sp' | 'spx' | 'x' | '',
      teeth: { '104': { missing, retained, attrition, abrasion, ccf, ucf, om, onf, pd,
                        pocketB, pocketL, furcation, recession, mobility, resorption, ext: '' | 'surgical' | 'nonsurgical' } },
      vet, day, updated }
  Vets pick WORDS; the chart and the PDF show the abbreviations, and the PDF lists what each one means.
*/
(function (root) {
  'use strict';

  /* ---------- the mouth: Triadan numbers, root counts, names ---------- */
  const POSITION = { 1: 'first incisor', 2: 'second incisor', 3: 'third incisor', 4: 'canine', 5: 'first premolar', 6: 'second premolar', 7: 'third premolar', 8: 'fourth premolar', 9: 'first molar', 10: 'second molar', 11: 'third molar' };
  // teeth present on each side of the mouth, by position number
  const PRESENT = {
    canine: { upper: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], lower: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    feline: { upper: [1, 2, 3, 4, 6, 7, 8, 9], lower: [1, 2, 3, 4, 7, 8, 9] }
  };
  // roots per tooth (standard counts; shown on every tooth so the vet can see what has to come out)
  const ROOTS = {
    canine: { upper: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 3, 9: 3, 10: 3 }, lower: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 2, 10: 2, 11: 1 } },
    feline: { upper: { 1: 1, 2: 1, 3: 1, 4: 1, 6: 1, 7: 2, 8: 3, 9: 2 }, lower: { 1: 1, 2: 1, 3: 1, 4: 1, 7: 2, 8: 2, 9: 2 } }
  };
  const SIDE = { 1: 'right', 2: 'left', 3: 'left', 4: 'right' };   // Triadan quadrant -> side of the animal
  // chart layout, left to right as you look at it: upper right | upper left, lower right | lower left
  function quadrants(species) {
    const sp = PRESENT[species] || PRESENT.canine;
    const q = (n, arch, leftBlock) => {
      const pos = sp[arch].slice();                       // 1 = next to the midline
      const nums = pos.map(p => n * 100 + p);
      return { quadrant: n, arch, side: SIDE[n], teeth: leftBlock ? nums.slice().reverse() : nums, leftBlock };
    };
    return { upper: [q(1, 'upper', true), q(2, 'upper', false)], lower: [q(4, 'lower', true), q(3, 'lower', false)] };
  }
  function toothList(species) {
    const Q = quadrants(species);
    return Q.upper.concat(Q.lower).reduce((all, q) => all.concat(q.teeth), []);
  }
  function toothInfo(species, num) {
    num = Number(num);
    const quad = Math.floor(num / 100), pos = num % 100;
    const arch = quad <= 2 ? 'upper' : 'lower';
    const sp = species === 'feline' ? 'feline' : 'canine';
    if (!SIDE[quad] || !PRESENT[sp][arch].includes(pos)) return null;
    const type = pos <= 3 ? 'I' : pos === 4 ? 'C' : pos <= 8 ? 'PM' : 'M';
    return {
      num, quad, pos, arch, side: SIDE[quad], type, roots: ROOTS[sp][arch][pos],
      name: (arch === 'upper' ? 'Maxillary ' : 'Mandibular ') + SIDE[quad] + ' ' + POSITION[pos]
    };
  }

  /* ---------- findings (words for the vet, abbreviations on the chart) ---------- */
  const CHECKS = [   // tick boxes
    { key: 'missing', abbr: 'MISS', label: 'Missing tooth' },
    { key: 'retained', abbr: 'RTR', label: 'Retained root' },
    { key: 'attrition', abbr: 'AT', label: 'Attrition' },
    { key: 'abrasion', abbr: 'AB', label: 'Abrasion' },
    { key: 'ccf', abbr: 'CCF', label: 'Complicated crown fracture' },
    { key: 'ucf', abbr: 'UCF', label: 'Uncomplicated crown fracture' },
    { key: 'om', abbr: 'OM', label: 'Oral mass' },
    { key: 'onf', abbr: 'ONF', label: 'Oronasal fistula' },
    { key: 'pd', abbr: 'PD', label: 'Persistent deciduous' }
  ];
  const GRADES = [   // pick 1-3
    { key: 'furcation', abbr: 'FE', label: 'Furcation exposure', prefix: 'Grade' },
    { key: 'recession', abbr: 'GR', label: 'Gingival recession', prefix: 'Grade' },
    { key: 'mobility', abbr: 'M', label: 'Mobile tooth', prefix: 'Grade' },
    { key: 'resorption', abbr: 'TR', label: 'Tooth resorption', prefix: 'Type' }
  ];
  const EXTRACTIONS = { surgical: { abbr: 'XS', label: 'Extraction, surgical' }, nonsurgical: { abbr: 'XN', label: 'Extraction, non-surgical' } };
  const PROCEDURES = { sp: 'Scale and polish', spx: 'Scale and polish with extractions', x: 'Extractions only' };
  const POCKET_MAX = 12;

  // everything the PDF key explains: [abbreviation, meaning]
  function abbreviationKey() {
    const k = [];
    CHECKS.forEach(c => k.push([c.abbr, c.label]));
    GRADES.forEach(g => k.push([g.abbr + '1-3', g.label + ' (' + g.prefix.toLowerCase() + ' 1 to 3)']));
    k.push(['PP B/L', 'Periodontal pocket depth in mm: B = buccal side, L = lingual side']);
    k.push([EXTRACTIONS.surgical.abbr, EXTRACTIONS.surgical.label]);
    k.push([EXTRACTIONS.nonsurgical.abbr, EXTRACTIONS.nonsurgical.label]);
    return k;
  }

  function emptyTooth() {
    const t = { pocketB: '', pocketL: '', ext: '' };
    CHECKS.forEach(c => { t[c.key] = false; });
    GRADES.forEach(g => { t[g.key] = ''; });
    return t;
  }
  function normTooth(t) { return Object.assign(emptyTooth(), t || {}); }
  function toothTokens(t) {
    t = normTooth(t);
    if (t.missing) return ['MISS'];
    const out = [];
    CHECKS.forEach(c => { if (c.key !== 'missing' && t[c.key]) out.push(c.abbr); });
    GRADES.forEach(g => { if (t[g.key]) out.push(g.abbr + t[g.key]); });
    if (t.pocketB || t.pocketL) out.push('PP ' + [t.pocketB ? 'B' + t.pocketB : '', t.pocketL ? 'L' + t.pocketL : ''].filter(Boolean).join('/'));
    if (t.ext && EXTRACTIONS[t.ext]) out.push(EXTRACTIONS[t.ext].abbr);
    return out;
  }
  function hasFindings(t) { return toothTokens(t).length > 0; }
  // colour group for the tooth on the chart
  function toothClass(t) {
    t = normTooth(t);
    if (t.missing) return 'missing';
    if (t.ext) return 'ext';
    if (t.ccf || t.ucf) return 'fracture';
    if (t.resorption) return 'resorption';
    return hasFindings(t) ? 'finding' : 'none';
  }
  const COLOURS = {   // [fill rgb, line rgb]
    none: [[255, 255, 255], [90, 90, 90]], missing: [[235, 235, 235], [150, 150, 150]], ext: [[244, 190, 180], [181, 70, 43]],
    fracture: [[248, 220, 170], [201, 138, 26]], resorption: [[221, 205, 240], [122, 79, 181]], finding: [[255, 243, 190], [150, 120, 20]]
  };

  /* ---------- extractions and the surgery note ---------- */
  function extractionGroups(chart) {
    const g = { surgical: [], nonsurgical: [] };
    Object.keys((chart && chart.teeth) || {}).forEach(n => {
      const t = normTooth(chart.teeth[n]);
      if (!t.missing && g[t.ext]) g[t.ext].push(Number(n));
    });
    g.surgical.sort((a, b) => a - b); g.nonsurgical.sort((a, b) => a - b);
    return g;
  }
  // "407 surgical extraction; 401, 402 non-surgical extraction"
  function extractionSentence(chart) {
    const g = extractionGroups(chart), parts = [];
    if (g.surgical.length) parts.push(g.surgical.join(', ') + ' surgical extraction');
    if (g.nonsurgical.length) parts.push(g.nonsurgical.join(', ') + ' non-surgical extraction');
    return parts.join('; ');
  }
  function summarySentence(chart) {
    if (!chart) return '';
    const grade = String(chart.grade == null ? '' : chart.grade).trim();
    const desc = String(chart.desc || '').trim().replace(/^[,;\s]+/, '').replace(/[.\s]+$/, '');
    if (grade === '' && !desc) return '';
    if (grade === '') return desc.charAt(0).toUpperCase() + desc.slice(1) + '.';
    return 'G' + grade + '/4 dental disease' + (desc ? ', ' + desc : '') + '.';
  }
  // the two lines the Surgery note carries for this chart
  function noteBlock(chart) {
    const l1 = ['Refer to dental chart.', summarySentence(chart), PROCEDURES[chart.procedure] ? PROCEDURES[chart.procedure] + '.' : ''].filter(Boolean).join(' ');
    const ex = extractionSentence(chart);
    return l1 + '\nExtractions: ' + (ex ? ex + '.' : 'none.');
  }
  const BLOCK_RE = /^Refer to dental chart\..*\nExtractions: .*$/m;
  const TEMPLATE_EXTRACTION_LINE = '(Surgical / Closed / No) extractions performed.';
  // put (or refresh) the chart's lines in the surgical notes; returns the new text. Safe to run again and again.
  function applyToNote(note, chart) {
    note = String(note || '');
    if (!chart) return note;
    const block = noteBlock(chart);
    if (BLOCK_RE.test(note)) return note.replace(BLOCK_RE, () => block);
    if (note.indexOf(TEMPLATE_EXTRACTION_LINE) !== -1) return note.replace(TEMPLATE_EXTRACTION_LINE, () => block);
    const base = note.replace(/\s+$/, '');
    return (base ? base + '\n\n' : '') + block;
  }

  /* ---------- drawing: one shape set used by both the screen and the PDF ---------- */
  const BOX = { w: 40, h: 84, cx: 20, gumUpper: 40, gumLower: 44 };
  const CROWN = { I: [14, 22], C: [18, 38], PM: [22, 26], M: [32, 24] };
  const ROOT_LEN = { I: 26, C: 34, PM: 28, M: 26 };
  // returns polygons in a 40 x 84 box: upper teeth have roots above the gum line, lower teeth roots below
  function geometry(info) {
    const [cw, ch] = CROWN[info.type], rl = ROOT_LEN[info.type];
    const up = info.arch === 'upper', gum = up ? BOX.gumUpper : BOX.gumLower;
    const crownDir = up ? 1 : -1;            // crown grows away from the roots
    const P = (dx, d, dirSign) => [BOX.cx + dx, gum + dirSign * d];
    let rel;
    if (info.type === 'I') rel = [[-cw / 2, 0], [cw / 2, 0], [cw * 0.4, ch], [-cw * 0.4, ch]];
    else if (info.type === 'C') rel = [[-cw / 2, 0], [cw / 2, 0], [0, ch]];
    else if (info.type === 'PM') rel = [[-cw / 2, 0], [cw / 2, 0], [cw * 0.25, ch * 0.7], [0, ch], [-cw * 0.25, ch * 0.7]];
    else rel = [[-cw / 2, 0], [cw / 2, 0], [cw / 2, ch * 0.55], [cw * 0.2, ch], [-cw * 0.2, ch * 0.7], [-cw / 2, ch * 0.55]];
    const crown = rel.map(([dx, d]) => P(dx, d, crownDir));
    const n = info.roots;
    const xs = n === 1 ? [0] : n === 2 ? [-cw * 0.3, cw * 0.3] : [-cw * 0.38, 0, cw * 0.38];
    const rw = Math.max(3, Math.min(9, cw / n * 0.7));
    const roots = xs.map(x => [P(x - rw / 2, 0, -crownDir), P(x + rw / 2, 0, -crownDir), P(x * 1.25, rl, -crownDir)]);
    return { crown, roots, gum };
  }

  /* ---------- the PDF (one animal per file) ---------- */
  function buildPdf(chart, jsPDF, opts) {
    opts = opts || {};
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: opts.compress !== false });
    const species = chart.species === 'feline' ? 'feline' : 'canine';
    const W = 210, M = 12;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
    doc.text((species === 'feline' ? 'Feline' : 'Canine') + ' Dental Chart', M, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Date: ' + (opts.dateText || chart.day || ''), W - M, 18, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('Animal ID: ' + (chart.animalId || ''), M, 27);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    if (chart.vet) doc.text('Charted by: ' + chart.vet, W - M, 27, { align: 'right' });
    let y = 35;
    const summary = summarySentence(chart);
    if (summary) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(doc.splitTextToSize(summary, W - 2 * M), M, y); y += 7; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    if (PROCEDURES[chart.procedure]) { doc.text('Procedure: ' + PROCEDURES[chart.procedure], M, y); y += 6; }
    y += 3;

    // the mouth: every tooth sits a fixed width from the midline
    const cw = 8.2, scale = cw / BOX.w, scaleY = scale * 1.4, midX = W / 2;
    const Q = quadrants(species);
    const rowH = BOX.h * scaleY + 20;
    const drawRow = (qs, top, label) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text(label, midX, top + 2, { align: 'center' });
      qs.forEach(q => {
        q.teeth.forEach((num, i) => {
          const info = toothInfo(species, num);
          const k = q.leftBlock ? q.teeth.length - 1 - i : i;      // distance from the midline
          const x0 = q.leftBlock ? midX - (k + 1) * cw - 1 : midX + k * cw + 1;
          const g = geometry(info), t = normTooth(chart.teeth && chart.teeth[num]);
          const col = COLOURS[toothClass(t)];
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
          doc.setTextColor(60); doc.text(String(num), x0 + cw / 2, top + 6, { align: 'center' });
          const ty = top + 8;
          const poly = pts => pts.map(([px, py]) => [x0 + px * scale, ty + py * scaleY]);
          const draw = (pts, fill) => {
            const p = poly(pts), segs = [];
            for (let j = 1; j < p.length; j++) segs.push([p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]]);
            doc.setLineWidth(0.25); doc.setDrawColor.apply(doc, col[1]); doc.setFillColor.apply(doc, fill);
            doc.lines(segs, p[0][0], p[0][1], [1, 1], 'FD', true);
          };
          g.roots.forEach(r => draw(r, t.missing ? [245, 245, 245] : [225, 218, 205]));
          if (t.missing) doc.setLineDashPattern([0.6, 0.6], 0);
          draw(g.crown, col[0]);
          doc.setLineDashPattern([], 0);
          doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(5.6);
          let line = 0;
          toothTokens(t).forEach(tok => tok.split(' ').forEach(part => { doc.text(part, x0 + cw / 2, ty + BOX.h * scaleY + 3 + line * 2.4, { align: 'center' }); line++; }));
        });
      });
      doc.setTextColor(0);
    };
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('Right', M, y + 2); doc.text('Left', W - M, y + 2, { align: 'right' });
    drawRow(Q.upper, y, 'MAXILLA');
    drawRow(Q.lower, y + rowH + 4, 'MANDIBLE');
    y += 2 * rowH + 12;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    const ex = extractionSentence(chart);
    doc.text('Extractions: ' + (ex || 'none'), M, y); y += 8;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Abbreviation key', M, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const key = abbreviationKey(), colW = (W - 2 * M) / 2;
    key.forEach((row, i) => {
      const col = i % 2, line = Math.floor(i / 2);
      doc.setFont('helvetica', 'bold'); doc.text(row[0], M + col * colW, y + line * 4.6);
      doc.setFont('helvetica', 'normal'); doc.text(row[1], M + col * colW + 17, y + line * 4.6);
    });
    return doc;
  }

  const api = {
    POSITION, CHECKS, GRADES, EXTRACTIONS, PROCEDURES, POCKET_MAX, COLOURS, BOX,
    quadrants, toothList, toothInfo, abbreviationKey, emptyTooth, normTooth, toothTokens, hasFindings, toothClass,
    extractionGroups, extractionSentence, summarySentence, noteBlock, applyToNote, geometry, buildPdf,
    speciesOf: s => (s === 'cat' ? 'feline' : s === 'dog' ? 'canine' : null)
  };
  root.LDHDental = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
