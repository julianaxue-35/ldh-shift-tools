/* ============================================================
   Medication Chart module — shared by Processing / Sick & Injured /
   Surgery and the Medication Charts export page.
   Copyright (c) 2026 Juliana Xue. All rights reserved.

   Turns a free-text Plan instruction (e.g. "amoxyclav 250mg: give 1
   tablet orally morning and night for 5 days") into structured chart
   fields by matching against a known drug list + common phrasing —
   never silently guessing. Anything it can't confidently match is
   flagged for manual confirmation in the editable preview.

   Saved charts live in one shared localStorage key so every tool on
   this same-origin site (github.io/ldh-shift-tools) can save to, and
   the Medication Charts page can read from, the same list.
   ============================================================ */
(function (global) {
  var STORAGE_KEY = 'ldh_medcharts_v1';

  // Same vocabulary as the Yellow Stray + Shelter Stress FAS Excel
  // sheets (see project_ldh_medication_treatment_sheets memory) —
  // keep this list in sync if a drug is added/renamed there.
  var DRUG_VOCAB = [
    { key: 'amoxyclav', label: 'Amoxyclav', aliases: ['amoxyclav', 'amoxi-clav', 'amoxiclav', 'clavulox', 'amoxicillin clavulanate'], route: 'PO' },
    { key: 'doxycycline-paste', label: 'Doxycycline paste', aliases: ['doxycycline paste', 'doxy paste'], route: 'PO' },
    { key: 'doxycycline', label: 'Doxycycline', aliases: ['doxycycline', 'doxy'], route: 'PO' },
    { key: 'doxybrome', label: 'Doxybrome', aliases: ['doxybrome'], route: 'PO' },
    { key: 'meloxicam', label: 'Meloxicam', aliases: ['meloxicam', 'metacam'], route: 'PO', warning: 'MUST BE GIVEN WITH FOOD. STOP if vomiting, diarrhoea, or not eating.' },
    { key: 'panacur', label: 'Panacur (Fenbendazole)', aliases: ['panacur', 'fenbendazole'], route: 'PO' },
    { key: 'drontal', label: 'Drontal', aliases: ['drontal'], route: 'PO' },
    { key: 'paracetamol', label: 'Paracetamol (DOGS ONLY)', aliases: ['paracetamol', 'panadol'], route: 'PO', warning: 'FATAL TO CATS — dogs only' },
    { key: 'chlorsig', label: 'Chlorsig', aliases: ['chlorsig', 'chloramphenicol'], route: 'Ophthalmic (eye)' },
    { key: 'famvir', label: 'Famvir', aliases: ['famvir', 'famciclovir'], route: 'PO' },
    { key: 'mirtazapine-transdermal', label: 'Mirtazapine (transdermal)', aliases: ['mirataz', 'mirtazapine transdermal'], route: 'Transdermal' },
    { key: 'mirtazapine', label: 'Mirtazapine', aliases: ['mirtazapine'], route: 'PO' },
    { key: 'buprenorphine', label: 'Buprenorphine', aliases: ['buprenorphine', 'bupredyne', 'buprenodale'], route: 'Transmucosal' },
    { key: 'fluoxetine', label: 'Fluoxetine', aliases: ['fluoxetine', 'prozac'], route: 'PO' },
    { key: 'trazodone', label: 'Trazodone', aliases: ['trazodone'], route: 'PO' },
    { key: 'clonidine', label: 'Clonidine', aliases: ['clonidine'], route: 'PO' },
    { key: 'pregabalin', label: 'Pregabalin', aliases: ['pregabalin', 'lyrica'], route: 'PO' },
    { key: 'gabapentin', label: 'Gabapentin', aliases: ['gabapentin', 'gaba'], route: 'PO' },
    { key: 'lactulose', label: 'Lactulose', aliases: ['lactulose'], route: 'PO' },
    { key: 'ondansetron', label: 'Ondansetron', aliases: ['ondansetron', 'ondansetrone', 'zofran'], route: 'PO' },
    { key: 'fentanyl', label: 'Fentanyl', aliases: ['fentanyl'], route: 'Transdermal' },
    { key: 'codeine', label: 'Codeine', aliases: ['codeine'], route: 'PO' },
    { key: 'methadone', label: 'Methadone', aliases: ['methadone'], route: 'Injectable' },
    { key: 'butorphanol', label: 'Butorphanol', aliases: ['butorphanol'], route: 'Injectable' },
    { key: 'ketamine', label: 'Ketamine', aliases: ['ketamine'], route: 'Injectable' }
  ];

  // Same Schedule 8 list + Dangerous Drugs register link already used
  // elsewhere in this workspace (sick-injured.html) — kept in sync so
  // the sign-out reminder reads identically everywhere it appears.
  var S8_DRUG_NAMES = ['codeine', 'buprenorphine', 'fentanyl', 'methadone', 'butorphanol', 'ketamine'];
  var S8_DRUG_RE = new RegExp('\\b(' + S8_DRUG_NAMES.join('|') + ')\\b', 'i');
  var DDBOOK_URL = 'https://app.ddbook.com.au/access/login?ReturnUrl=%2fHome%2fDashboard2';

  // Longest-alias-first so e.g. "doxycycline paste" matches before
  // the bare "doxycycline" entry.
  var DRUGS_BY_ALIAS_LEN = DRUG_VOCAB.slice().sort(function (a, b) {
    var am = Math.max.apply(null, a.aliases.map(function (x) { return x.length; }));
    var bm = Math.max.apply(null, b.aliases.map(function (x) { return x.length; }));
    return bm - am;
  });

  function findDrug(text) {
    var low = text.toLowerCase();
    for (var i = 0; i < DRUGS_BY_ALIAS_LEN.length; i++) {
      var d = DRUGS_BY_ALIAS_LEN[i];
      for (var j = 0; j < d.aliases.length; j++) {
        if (low.indexOf(d.aliases[j]) !== -1) return d;
      }
    }
    return null;
  }

  function detectFreq(text) {
    var low = text.toLowerCase();
    if (/\bbid\b|\bb\.i\.d\.?\b|twice\s+(a\s+)?day|twice\s+daily|morning\s+and\s+(night|evening)|am\s+and\s+pm/.test(low)) return 'BID';
    if (/\bsid\b|\bs\.i\.d\.?\b|\bonce\s+(a\s+)?day\b|once\s+daily|\boid\b/.test(low)) return 'SID';
    return null;
  }

  function detectRoute(text, drug) {
    var low = text.toLowerCase();
    if (/\bpo\b|orally|by mouth|\boral\b/.test(low)) return 'PO';
    if (/\beye\b|ophthalmic/.test(low)) return 'Ophthalmic (eye)';
    if (/\bear\b|otic/.test(low)) return 'Otic (ear)';
    if (/transdermal/.test(low)) return 'Transdermal';
    if (/\bsc\b|subcut|injection/.test(low)) return 'Subcutaneous';
    if (drug && drug.route) return drug.route;
    return null;
  }

  function detectDays(text) {
    var m = text.match(/for\s+(\d+)\s*day/i);
    return m ? parseInt(m[1], 10) : null;
  }

  // Matches "250mg", "1200mcg", or a compound concentration like
  // "200mg/mL" — deliberately anchored on mg/mcg, NEVER a bare "mL" on
  // its own, since a plain volume (e.g. "1ml") is her dosing amount,
  // not the drug's strength — even when there's no colon to separate
  // the name from the instruction (e.g. "Lactulose 1ml BID..." must
  // stay "Lactulose", not "Lactulose 1ml").
  function detectStrength(text) {
    var m = text.match(/(\d+(\.\d+)?\s*(?:mg|mcg)(?:\s*\/\s*m[lL])?)/i);
    return m ? m[1].replace(/\s+/g, '') : null;
  }

  function detectDoseText(text) {
    var m = text.match(/(\d+(\.\d+)?\s*(tablets?|tabs?|capsules?|caps?|ml|drops?|notch(es)?))/i);
    if (m) return m[1];
    // Fallback for a dose given as a bare strength (e.g. "give 2mg" or
    // "2mg/kg") rather than a tablet/mL amount — still belongs under
    // Dosing, never folded into the drug name.
    var m2 = text.match(/(\d+(\.\d+)?\s*(?:mg|mcg)(?:\s*\/\s*kg)?)/i);
    return m2 ? m2[1].replace(/\s+/g, '') : '';
  }

  // Her documented convention is "Drug strength: instruction" (e.g.
  // "amoxyclav 250mg: give 1 tablet..."), so a colon reliably splits
  // the drug/strength half from the dose/frequency half. Without a
  // colon, the word "give" is the next-most-reliable boundary. This
  // matters because searching for a strength number across the WHOLE
  // line lets a dose amount like "give 0.5ml" get misread as the
  // drug's strength.
  function splitInstruction(line) {
    var colonIdx = line.indexOf(':');
    if (colonIdx !== -1) return { head: line.slice(0, colonIdx), tail: line.slice(colonIdx + 1) };
    var m = line.match(/\bgive\b/i);
    if (m) return { head: line.slice(0, m.index), tail: line.slice(m.index) };
    return { head: line, tail: line };
  }

  // When a drug isn't in the vocabulary AND the line had no colon/"give"
  // boundary to split on, `head` is the whole line — which would show
  // the entire instruction as the "drug name". Trim it down to just the
  // text before the first digit instead (her convention is always
  // "Drug [strength] amount..."), so an unrecognised drug still gets a
  // clean, readable guess rather than a full sentence.
  function guessDrugNameOnly(line, head) {
    var trimmedHead = head.trim();
    if (trimmedHead !== line.trim()) return trimmedHead || line.trim();
    var numMatch = line.match(/\d/);
    if (!numMatch) return line.trim();
    return line.slice(0, numMatch.index).trim() || line.trim();
  }

  function splitLines(text) {
    return String(text || '')
      .split(/\n|;/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  // Returns one entry per line of the Plan text. Every field the
  // parser couldn't confidently detect still gets a sane editable
  // default (never left silently blank in the preview), plus a
  // `warnings` list naming exactly what to double-check.
  function parseMedPlan(text) {
    return splitLines(text).map(function (line) {
      var parts = splitInstruction(line);
      var drug = findDrug(line);
      var strength = detectStrength(parts.head);
      var freq = detectFreq(line);
      var route = detectRoute(line, drug);
      var days = detectDays(line);
      var doseText = detectDoseText(parts.tail) || detectDoseText(line);
      var warnings = [];
      if (!drug) warnings.push('Drug not recognised — pick manually');
      if (!freq) warnings.push('Frequency unclear — confirm SID/BID');
      if (!route) warnings.push('Route unclear — confirm');
      if (!days) warnings.push('Duration unclear — confirm number of days');
      if (!doseText) warnings.push('Dose amount unclear — confirm');
      // When the drug isn't recognised, show what she actually typed —
      // always something readable to correct, never the whole sentence.
      var fallbackLabel = guessDrugNameOnly(line, parts.head);
      // Schedule 8 check runs on the raw text regardless of vocab match
      // (same drug list as sick-injured.html's existing S8 flag), so an
      // S8 drug is never missed just because it's phrased unusually.
      var s8 = S8_DRUG_RE.test(line);
      var warningParts = [];
      if (drug && drug.warning) warningParts.push(drug.warning);
      if (s8) warningParts.push('SCHEDULE 8 DRUG — sign out at ' + DDBOOK_URL);
      return {
        rawText: line,
        drugKey: drug ? drug.key : '',
        drugLabel: drug ? (drug.label + (strength ? ' ' + strength : '')) : fallbackLabel,
        doseText: doseText,
        freq: freq || 'BID',
        route: route || 'PO',
        days: days || 5,
        startSlot: 'AM', // SID meds default to AM per house rule (matches the real sheet's Day-1 = TOMORROW convention); PM is a manual override
        drugWarning: warningParts.join('  |  '),
        s8: s8,
        matched: !!drug,
        warnings: warnings
      };
    });
  }

  // Static AM/PM circle grid for 14 days, computed once at export
  // time (no live formulas needed — the dose is already decided by
  // the time this chart is registered, unlike the weight-based
  // auto-calc columns on the Excel sheets).
  function computeGrid(med) {
    var am = [], pm = [];
    var D = parseInt(med.days, 10) || 0;
    for (var day = 1; day <= 14; day++) {
      var a = '', p = '';
      if (day <= D) {
        if (med.freq === 'BID') { a = '◯'; p = '◯'; }
        else if (med.startSlot === 'PM') { p = '◯'; }
        else { a = '◯'; }
      } else if (day === D + 1) {
        if (med.freq === 'BID') { a = 'R/C'; p = 'R/C'; }
        else if (med.startSlot === 'PM') { p = 'R/C'; }
        else { a = 'R/C'; }
      }
      am.push(a); pm.push(p);
    }
    return { am: am, pm: pm };
  }

  // ---------- exact-template export (raw OOXML surgery) ----------
  // A naive read-modify-write round trip through a spreadsheet JS
  // library was tested and confirmed to silently destroy print setup,
  // borders, and fonts (verified: fitToWidth/fitToHeight, orientation,
  // and font size were all lost on round trip). The only way to
  // guarantee the exported file is byte-identical to the real template
  // except for the specific data cells is to edit the worksheet XML
  // directly and never let anything reparse/rewrite the rest of the
  // package — the same principle already used for her Word docx
  // surgery elsewhere in this workspace.
  var TEMPLATE_URL = 'template/medication-chart-template.xlsx';
  var TEMPLATE_SHEET_PART = 'xl/worksheets/sheet1.xml';
  // AM row per day 1-14 in the real template; the PM row is always
  // exactly one row below (e.g. day 1 = row 16 AM / row 17 PM).
  var GRID_ROWS = [16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42];
  // The real template's 5 medication boxes, by cell address, mapped
  // from `xl/worksheets/sheet1.xml` in 14-Day-Yellow-Medication-Sheet-
  // Strays.xlsx (medication dropdown / days / food-warning / dose /
  // freq / route / day-grid column, per box).
  var BOXES = [
    { med: 'C9', days: 'D10', warn: 'C11', dose: 'C12', freq: 'C13', route: 'C14', grid: 'D' },
    { med: 'F9', days: 'G10', warn: 'F11', dose: 'F12', freq: 'F13', route: 'F14', grid: 'G' },
    { med: 'I9', days: 'J10', warn: 'I11', dose: 'I12', freq: 'I13', route: 'I14', grid: 'J' },
    { med: 'L9', days: 'M10', warn: 'L11', dose: 'L12', freq: 'L13', route: 'L14', grid: 'M' },
    { med: 'O9', days: 'P10', warn: 'O11', dose: 'O12', freq: 'O13', route: 'O14', grid: 'P' }
  ];
  var MAX_MEDS_PER_SHEET = BOXES.length;
  var HEADER_CELLS = { patientId: 'A2', location: 'I3', vetInCharge: 'N3', vetPlan: 'A5' };

  function escapeXmlText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Replaces exactly one `<c r="ADDR" .../>` cell element in a
  // worksheet XML string, preserving its style reference (`s="N"`) and
  // touching nothing else — no other cell, merge, border, or print
  // setting in the file is ever re-serialized.
  function setCellXml(xml, addr, value) {
    var re = new RegExp('<c r="' + addr + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)');
    var m = re.exec(xml);
    if (!m) throw new Error('Template cell not found: ' + addr);
    var sm = /s="(\d+)"/.exec(m[1]);
    var sAttr = sm ? (' s="' + sm[1] + '"') : '';
    var tag;
    if (value === null || value === undefined || value === '') {
      tag = '<c r="' + addr + '"' + sAttr + '/>';
    } else if (typeof value === 'number') {
      tag = '<c r="' + addr + '"' + sAttr + '><v>' + value + '</v></c>';
    } else {
      tag = '<c r="' + addr + '"' + sAttr + ' t="inlineStr"><is><t xml:space="preserve">' + escapeXmlText(value) + '</t></is></c>';
    }
    return xml.slice(0, m.index) + tag + xml.slice(m.index + m[0].length);
  }

  // Excel sheet names: max 31 chars, no \/?*[]:, unique within the
  // workbook — duplicate/blank patient IDs get a numeric suffix.
  function safeSheetName(base, used) {
    var name = String(base || 'Animal').replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 28) || 'Animal';
    var candidate = name, n = 2;
    while (used.has(candidate)) { candidate = (name + ' (' + (n++) + ')').slice(0, 31); }
    used.add(candidate);
    return candidate;
  }

  // Builds one patched copy of the real template's sheet XML for a
  // single animal chart. Only the cells listed above are ever touched.
  function patchSheetXml(templateXml, chart) {
    var xml = templateXml;
    if (chart.animalId) xml = setCellXml(xml, HEADER_CELLS.patientId, 'Patient ID: ' + chart.animalId);
    if (chart.location) xml = setCellXml(xml, HEADER_CELLS.location, 'Location: ' + chart.location);
    if (chart.weight) xml = setCellXml(xml, 'B8', parseFloat(chart.weight) || chart.weight);
    if (chart.vetInCharge) xml = setCellXml(xml, HEADER_CELLS.vetInCharge, 'Vet in Charge: ' + chart.vetInCharge);
    if (chart.problemList) xml = setCellXml(xml, HEADER_CELLS.vetPlan, 'Vet Plan:   Problems — ' + chart.problemList);
    var meds = chart.meds.slice(0, MAX_MEDS_PER_SHEET);
    meds.forEach(function (m, i) {
      var box = BOXES[i];
      xml = setCellXml(xml, box.med, m.drugLabel || '');
      xml = setCellXml(xml, box.days, parseInt(m.days, 10) || 0);
      xml = setCellXml(xml, box.warn, m.drugWarning || '');
      xml = setCellXml(xml, box.dose, 'Dose: ' + (m.doseText || ''));
      xml = setCellXml(xml, box.freq, 'Freq: ' + m.freq);
      xml = setCellXml(xml, box.route, 'Route: ' + m.route);
      var grid = computeGrid(m);
      for (var d = 0; d < 14; d++) {
        var amRow = GRID_ROWS[d], pmRow = amRow + 1;
        xml = setCellXml(xml, box.grid + amRow, grid.am[d] || '');
        xml = setCellXml(xml, box.grid + pmRow, grid.pm[d] || '');
      }
    });
    return xml;
  }

  function loadCharts() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveCharts(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
  function addChart(chart) {
    var list = loadCharts();
    list.push(chart);
    saveCharts(list);
    return chart;
  }
  function deleteChart(id) {
    saveCharts(loadCharts().filter(function (c) { return c.id !== id; }));
  }
  // Finds a previously-saved chart for the same underlying animal
  // record (matched by the shift tool's own internal id, not the
  // typed Patient ID text, which may still be blank or later edited).
  function findChartBySourceAnimal(sourceAnimalId) {
    return loadCharts().find(function (c) { return c.sourceAnimalId === sourceAnimalId; }) || null;
  }
  function uid() {
    return 'mc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Keeps ONE machine-computed medication (e.g. the auto oral-meloxicam
  // post-op course) in sync on an animal's chart, identified by a stable
  // `autoKey` — finds-and-updates only its own row, so it never disturbs
  // any other medication a vet has manually registered on the same
  // chart. Creates the chart if the animal doesn't have one yet.
  function upsertAutoMed(animalMeta, autoKey, medFields) {
    var list = loadCharts();
    var chart = list.find(function (c) { return c.sourceAnimalId === animalMeta.sourceAnimalId; });
    var med = Object.assign({ autoKey: autoKey, matched: true, s8: false, warnings: [] }, medFields);
    if (!chart) {
      chart = Object.assign({ id: uid(), createdAt: new Date().toISOString(), meds: [] }, animalMeta);
      list.push(chart);
    } else {
      Object.assign(chart, animalMeta); // refresh weight/location/etc. in case they've changed
    }
    var idx = chart.meds.findIndex(function (m) { return m.autoKey === autoKey; });
    if (idx === -1) {
      if (chart.meds.length < MAX_MEDS_PER_SHEET) chart.meds.push(med);
    } else {
      chart.meds[idx] = med;
    }
    saveCharts(list);
  }

  // Removes just the auto-managed row (by autoKey) from an animal's
  // chart; deletes the whole chart if that was its only medication.
  function removeAutoMed(sourceAnimalId, autoKey) {
    var list = loadCharts();
    var chart = list.find(function (c) { return c.sourceAnimalId === sourceAnimalId; });
    if (!chart) return;
    chart.meds = chart.meds.filter(function (m) { return m.autoKey !== autoKey; });
    if (!chart.meds.length) {
      saveCharts(list.filter(function (c) { return c !== chart; }));
    } else {
      saveCharts(list);
    }
  }

  // Same "Saved to register... sign it out now" wording already used
  // for S8 drugs in sick-injured.html, reused here so vets get the same
  // reminder regardless of which tool registered the chart.
  function saveConfirmationMessage(chart) {
    var s8Meds = chart.meds.filter(function (m) { return m.s8; }).map(function (m) { return m.drugLabel; });
    if (s8Meds.length) {
      return 'Medication chart saved.\n\n⚠️ Schedule 8 drug recorded: ' + s8Meds.join(', ') + '.\nSign it out now at ' + DDBOOK_URL;
    }
    return 'Medication chart saved. Open "Medication Charts" from the shift tools hub to review and export.';
  }

  global.MedChart = {
    STORAGE_KEY: STORAGE_KEY,
    DRUG_VOCAB: DRUG_VOCAB,
    S8_DRUG_NAMES: S8_DRUG_NAMES,
    DDBOOK_URL: DDBOOK_URL,
    TEMPLATE_URL: TEMPLATE_URL,
    TEMPLATE_SHEET_PART: TEMPLATE_SHEET_PART,
    MAX_MEDS_PER_SHEET: MAX_MEDS_PER_SHEET,
    parseMedPlan: parseMedPlan,
    computeGrid: computeGrid,
    patchSheetXml: patchSheetXml,
    safeSheetName: safeSheetName,
    loadCharts: loadCharts,
    saveCharts: saveCharts,
    addChart: addChart,
    deleteChart: deleteChart,
    findChartBySourceAnimal: findChartBySourceAnimal,
    upsertAutoMed: upsertAutoMed,
    removeAutoMed: removeAutoMed,
    saveConfirmationMessage: saveConfirmationMessage,
    uid: uid
  };
})(window);
