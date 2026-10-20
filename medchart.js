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
    { key: 'doxybrome', label: 'Doxybrom', aliases: ['doxybrome', 'doxybrom'], route: 'PO' },
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

  // A handful of drugs come in more than one form she needs distinguished
  // on the printed chart itself (not just the free-text instruction) —
  // e.g. Chlorsig Ointment vs Chlorsig Drops are dosed/applied differently.
  // Checked against the whole line, longest/most-specific phrasing first
  // per drug so "chlorsig ointment" doesn't also trip a looser match.
  var FORM_SUFFIXES = {
    chlorsig: [
      { re: /\bointment\b/i, label: 'Ointment' },
      { re: /\bdrops?\b/i, label: 'Drops' }
    ],
    famvir: [
      { re: /\bliquid\b/i, label: 'Liquid' }
    ]
  };
  function detectFormSuffix(text, drugKey) {
    var variants = FORM_SUFFIXES[drugKey];
    if (!variants) return '';
    for (var i = 0; i < variants.length; i++) {
      if (variants[i].re.test(text)) return variants[i].label;
    }
    return '';
  }

  // Picks whichever INDIVIDUAL alias actually found in the text is
  // longest, across every drug — not a pre-sort by each drug's longest
  // alias. That earlier approach broke whenever a drug had a mix of one
  // long specific alias and one short generic one (e.g. Doxycycline's
  // 'doxy' is only 4 chars, but Doxycycline as an ENTRY sorted ahead of
  // Doxybrome because 'doxycycline' itself is 11 chars) — so "doxybrom"
  // matched via Doxycycline's short 'doxy' alias before Doxybrome's own
  // (longer, more specific) alias ever got checked. Comparing actual
  // matched-alias length directly fixes both that and the original
  // "doxycycline paste" vs bare "doxycycline" case it was written for.
  function findDrug(text) {
    var low = text.toLowerCase();
    var best = null, bestLen = 0;
    for (var i = 0; i < DRUG_VOCAB.length; i++) {
      var d = DRUG_VOCAB[i];
      for (var j = 0; j < d.aliases.length; j++) {
        var alias = d.aliases[j];
        if (alias.length > bestLen && low.indexOf(alias) !== -1) { best = d; bestLen = alias.length; }
      }
    }
    return best;
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
    if (/transdermal/.test(low)) return 'Transdermal';
    if (/\bear\b|otic/.test(low)) return 'Otic (ear)';
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
  // stay "Lactulose", not "Lactulose 1ml"). Also excludes anything
  // immediately followed by "/kg" (e.g. "25mg/kg", "90mg/kg") — that's
  // a dosing rate per bodyweight, never the drug's own concentration.
  // A real concentration is always just "Amoxyclav 250mg", never
  // "Amoxyclav 25mg/kg"; the mg/kg number still gets recorded, just
  // under Dose (see detectDoseText), not folded into the drug name.
  function detectStrength(text) {
    var m = text.match(/(\d+(\.\d+)?\s*(?:mg|mcg)(?:\s*\/\s*m[lL])?)(?!\s*\/\s*kg)/i);
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

  // ---- Full-sentence label (2026-10-13) ----
  // "gabapentin 0.3ml po bid" -> "Gabapentin 0.3ml orally twice daily, review
  // due 20/10". Built from fields already on the med row (no new typing); the
  // review date is a date she typed in the line ("until/review 20/10"), else
  // the first day after the last dose (start + days). Meloxicam always
  // carries "Must be given with food."
  var ROUTE_WORDS = {
    'PO': 'orally', 'Ophthalmic (eye)': 'in the eye', 'Transdermal': 'transdermally',
    'Otic (ear)': 'in the ear', 'Subcutaneous': 'subcutaneously',
    'Transmucosal': 'transmucosally', 'Injectable': 'by injection'
  };
  function routeWords(route) {
    if (!route) return '';
    return ROUTE_WORDS[route] || String(route).toLowerCase();
  }
  function freqWords(freq) {
    return freq === 'BID' ? 'twice daily' : (freq === 'SID' ? 'once daily' : (freq || ''));
  }
  function needsFood(med) {
    return med.drugKey === 'meloxicam' || /must be given with food/i.test(med.drugWarning || '') ||
      /\bmeloxicam\b|\bmetacam\b/i.test(med.drugLabel || '');
  }
  // The recheck is the day AFTER the last dose: day 1 + the number of days. It follows the Days box. A date the vet
  // typed in the plan ("review 26/10") is used only while Days is still what was read from that same line; once
  // Days is changed, the recheck is worked out from the new number of days.
  function reviewDateText(med, baseDate, chartStart) {
    var days = parseInt(med.days, 10);
    var daysUnchanged = med.daysParsed == null || parseInt(med.daysParsed, 10) === days;
    var m = daysUnchanged ? /\b(?:review|re-?check|until|till|to|by)\s+(?:due\s+)?(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*\d{2,4})?/i.exec(med.rawText || '') : null;
    if (m) return parseInt(m[1], 10) + '/' + parseInt(m[2], 10);
    if (!days) return '';
    var d = new Date(baseDate || Date.now());
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + ((med.startOption || chartStart || 'tomorrow') === 'today' ? 0 : 1) + days);
    return d.getDate() + '/' + (d.getMonth() + 1);
  }
  // For the editors: "Tue 27/10" (weekday + date), or '' when there is no way to work one out.
  function recheckDisplay(med, baseDate, chartStart) {
    var txt = reviewDateText(med, baseDate, chartStart);
    var m = /^(\d{1,2})\/(\d{1,2})$/.exec(txt);
    if (!m) return '';
    var base = new Date(baseDate || Date.now());
    var d = new Date(base.getFullYear(), parseInt(m[2], 10) - 1, parseInt(m[1], 10), 12);
    if (d.getTime() < base.getTime() - 30 * 86400000) d.setFullYear(d.getFullYear() + 1);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + txt;
  }
  // Puts the recheck date on the medication lines of the NOTE itself ("... for 7 days (recheck 27/10)"), worked out from the
  // line she typed. Our own earlier "(recheck d/m)" is dropped and recomputed each time, so changing "7 days" to "10 days"
  // moves the date; a line where she wrote her own review / recheck / until date is left alone.
  var RECHECK_MARK_RE = /\s*\(recheck \d{1,2}\/\d{1,2}\)\s*$/;
  function annotateRecheck(text, baseDate, startOption) {
    return String(text || '').split('\n').map(function (line) {
      var core = line.replace(RECHECK_MARK_RE, '');
      if (!core.trim() || /\b(review|re-?check|until|till)\b/i.test(core)) return core;
      var days = detectDays(core);
      if (!days) return core;
      var d = new Date(baseDate || Date.now());
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + (startOption === 'today' ? 0 : 1) + days);
      return core + ' (recheck ' + d.getDate() + '/' + (d.getMonth() + 1) + ')';
    }).join('\n');
  }
  // The chart's medication label goes back into the note: the plan line the chart was made from is replaced by the final label
  // (including any edits made in the chart editor), so the note and the printed chart say exactly the same thing. Any
  // "(x mg/kg)" the tool worked out for that line is kept. A line she has changed since is left alone.
  var MGKG_RE = /\(\s*[\d.]+\s*mg\/kg\s*\)/i;
  function putLabelsInNote(text, chart) {
    var base = new Date(chart.createdAt || Date.now());
    var meds = (chart.meds || []).filter(function (m) { return m.rawText; });
    return String(text || '').split('\n').map(function (line) {
      var core = line.replace(RECHECK_MARK_RE, '').trim();
      for (var i = 0; i < meds.length; i++) {
        if (meds[i].rawText.trim() !== core) continue;
        var label = labelFor(meds[i], base, chart.startOption);
        if (!label) return line;
        var mg = MGKG_RE.exec(core);
        if (mg && !MGKG_RE.test(label)) label = /, review due /.test(label) ? label.replace(/(, review due .+)$/, ' ' + mg[0] + '$1') : label + ' ' + mg[0];
        return label;
      }
      return line;
    }).join('\n');
  }
  function buildLabelSentence(med, baseDate, chartStart) {
    var head = [med.drugLabel, med.doseText, routeWords(med.route), freqWords(med.freq)]
      .filter(Boolean).join(' ').trim();
    if (!head) return '';
    var review = reviewDateText(med, baseDate, chartStart);
    var out = head + (review ? ', review due ' + review : '');
    if (needsFood(med)) out += '. Must be given with food.';
    return out;
  }
  // The label that goes out: her own wording if she edited it, else rebuilt
  // from the current fields (so editing a saved chart never leaves it stale).
  function labelFor(med, baseDate, chartStart) {
    if (!(med.labelEdited && med.labelText)) return buildLabelSentence(med, baseDate, chartStart);
    // her own wording stays, but every medication carries a recheck date: add one if she did not write one
    var txt = med.labelText, review = reviewDateText(med, baseDate, chartStart);
    if (review && !/\b(review|re-?check)\b/i.test(txt)) txt = txt.replace(/[\s.]+$/, '') + ', review due ' + review;
    return txt;
  }

  // Returns one entry per line of the Plan text. Every field the
  // parser couldn't confidently detect still gets a sane editable
  // default (never left silently blank in the preview), plus a
  // `warnings` list naming exactly what to double-check.
  function parseMedPlan(text) {
    return splitLines(text).map(function (line) {
      // our own "(recheck d/m)" note-marker is not a date the vet typed: the chart works the recheck out from the days
      line = line.replace(RECHECK_MARK_RE, '');
      var parts = splitInstruction(line);
      var drug = findDrug(line);
      var strength = detectStrength(parts.head);
      var freq = detectFreq(line);
      var route = detectRoute(line, drug);
      var days = detectDays(line);
      var doseText = detectDoseText(parts.tail) || detectDoseText(line);
      var formSuffix = drug ? detectFormSuffix(line, drug.key) : '';
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
      var row = {
        rawText: line,
        drugKey: drug ? drug.key : '',
        drugLabel: drug ? (drug.label + (formSuffix ? ' ' + formSuffix : '') + (strength ? ' ' + strength : '')) : fallbackLabel,
        doseText: doseText,
        freq: freq || 'BID',
        route: route || 'PO',
        days: days || 5,
        startSlot: 'AM', // SID meds default to AM per house rule (matches the real sheet's Day-1 = TOMORROW convention); PM is a manual override
        drugWarning: warningParts.join('  |  '),
        s8: s8,
        matched: !!drug,
        warnings: warnings,
        labelEdited: false
      };
      row.daysParsed = row.days;   // so a typed review date is only trusted while Days is unchanged
      row.labelText = buildLabelSentence(row);
      return row;
    });
  }

  // Static AM/PM circle grid for 14 days, computed once at export
  // time (no live formulas needed — the dose is already decided by
  // the time this chart is registered, unlike the weight-based
  // auto-calc columns on the Excel sheets).
  // `shift` = number of leading blank days before this med's Day 1 (a med
  // starting tomorrow on a chart whose date column begins today has shift 1).
  function computeGrid(med, shift) {
    var am = [], pm = [];
    var D = parseInt(med.days, 10) || 0;
    shift = shift || 0;
    for (var day = 1; day <= 14; day++) {
      var a = '', p = '';
      var k = day - shift; // this med's own day number
      if (k >= 1 && k <= D) {
        if (med.freq === 'BID') { a = '◯'; p = '◯'; }
        else if (med.startSlot === 'PM') { p = '◯'; }
        else { a = '◯'; }
      } else if (k === D + 1) {
        if (med.freq === 'BID') { a = 'R/C'; p = 'R/C'; }
        else if (med.startSlot === 'PM') { p = 'R/C'; }
        else { a = 'R/C'; }
      }
      am.push(a); pm.push(p);
    }
    return { am: am, pm: pm };
  }

  // ---------- per-medication start day ----------
  // Each med carries its own `startOption` ('today' | 'tomorrow'). A med
  // saved before this existed has none, so it falls back to the chart-level
  // `startOption` (and then to 'tomorrow') and renders exactly as before.
  function medStartOffset(med, chart) {
    var opt = (med && med.startOption) || (chart && chart.startOption);
    return opt === 'today' ? 0 : 1;
  }
  // The shared date column begins on the earliest med's start day.
  function chartBaseOffset(chart) {
    var meds = (chart && chart.meds) || [];
    if (!meds.length) return medStartOffset(null, chart);
    return Math.min.apply(null, meds.map(function (m) { return medStartOffset(m, chart); }));
  }
  function gridShift(med, chart) {
    return medStartOffset(med, chart) - chartBaseOffset(chart);
  }
  // The 14-row grid can't show a med whose shifted course runs past Day 14.
  function gridOverflows(med, shift) {
    return (parseInt(med.days, 10) || 0) + (shift || 0) > 14;
  }
  // Text for a confirm() at Save time; '' when nothing overflows.
  function startOverflowMessage(meds, fallbackOption) {
    var chart = { startOption: fallbackOption, meds: meds };
    var bad = meds.filter(function (m) { return gridOverflows(m, gridShift(m, chart)); })
      .map(function (m) { return m.drugLabel || 'a medication'; });
    if (!bad.length) return '';
    return 'These medications start tomorrow on a chart that also has medications starting today, so their course runs past the 14-day grid and the last day(s) will be cut off:\n\n' +
      bad.join(', ') + '\n\nSave anyway?';
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

  // Excel's date serial number: days since 1899-12-30 (Excel's epoch,
  // including its historical 1900-leap-year quirk). Writing a plain number
  // here — instead of the template's live "=TODAY()+1" formula — is what
  // actually shows a date: the template's own cached value for that formula
  // is empty, so any viewer that doesn't recalculate formulas on open (most
  // non-Excel viewers, and even Excel without a forced recalculation) shows
  // it blank. A frozen value also stops the date drifting if the chart is
  // reopened on a later day — same "decided once at registration, not live"
  // approach already used for the AM/PM grid (see computeGrid).
  function excelDateSerial(date) {
    var epoch = Date.UTC(1899, 11, 30);
    return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - epoch) / 86400000);
  }

  // Builds one patched copy of the real template's sheet XML for a
  // single animal chart. Only the cells listed above are ever touched.
  function patchSheetXml(templateXml, chart) {
    // The template's cursor points at a frozen pane (pane="bottomLeft") the sheet doesn't have, which made Excel
    // say "We found a problem with some content" and repair the View. Drop the stray reference.
    var xml = templateXml.replace(/(<selection\b[^>]*?)\s+pane="[^"]*"/g, '$1');
    // widen the date column so "Sat 17-Oct" fits (a too-narrow date shows as #####)
    xml = xml.replace('<col width="10.5" customWidth="1" min="1" max="1"/>', '<col width="15" customWidth="1" min="1" max="1"/>');
    if (chart.animalId) xml = setCellXml(xml, HEADER_CELLS.patientId, 'Patient ID: ' + chart.animalId);
    if (chart.location) xml = setCellXml(xml, HEADER_CELLS.location, 'Location: ' + chart.location);
    if (chart.weight) xml = setCellXml(xml, 'B8', parseFloat(chart.weight) || chart.weight);
    if (chart.vetInCharge) xml = setCellXml(xml, HEADER_CELLS.vetInCharge, 'Vet in Charge: ' + chart.vetInCharge);
    if (chart.problemList) xml = setCellXml(xml, HEADER_CELLS.vetPlan, 'Vet Plan:   ' + chart.problemList);
    // Day 1 starts either the registration date itself or one day ahead of
    // it, per her choice at Save (`chart.startOption`, default 'tomorrow' —
    // matches the template's own original "=TODAY()+1" intent, and keeps
    // every chart saved before this option existed rendering exactly as
    // before). Day 2 is +1 from Day 1, etc., one date per AM/PM row pair.
    // Per-med `startOption` overrides this; the date column starts on the
    // earliest med's start day and later-starting meds are shifted down.
    var startSerial = excelDateSerial(new Date(chart.createdAt || Date.now()));
    var exported = Object.assign({}, chart, { meds: chart.meds.slice(0, MAX_MEDS_PER_SHEET) });
    var dayOffset = chartBaseOffset(exported);
    GRID_ROWS.forEach(function (row, i) {
      xml = setCellXml(xml, 'A' + row, startSerial + dayOffset + i);
    });
    var meds = chart.meds.slice(0, MAX_MEDS_PER_SHEET);
    meds.forEach(function (m, i) {
      var box = BOXES[i];
      xml = setCellXml(xml, box.med, m.drugLabel || '');
      xml = setCellXml(xml, box.days, parseInt(m.days, 10) || 0);
      var reviewTxt = reviewDateText(m, chart.createdAt ? new Date(chart.createdAt) : new Date(), chart.startOption);
      xml = setCellXml(xml, box.warn, [m.drugWarning || '', reviewTxt ? 'Review due ' + reviewTxt : ''].filter(Boolean).join('  |  '));
      xml = setCellXml(xml, box.dose, 'Dose: ' + (m.doseText || ''));
      xml = setCellXml(xml, box.freq, 'Freq: ' + freqWords(m.freq));
      xml = setCellXml(xml, box.route, 'Route: ' + routeWords(m.route));
      var grid = computeGrid(m, gridShift(m, exported));
      for (var d = 0; d < 14; d++) {
        var amRow = GRID_ROWS[d], pmRow = amRow + 1;
        var am = grid.am[d] || '', pm = grid.pm[d] || '';
        // Saturday and Sunday: staff only work until the AM, so a twice-daily drug is charted ONCE (the AM); its PM
        // slot gets a dash so it isn't mistaken for a missed tick. A drug given only in the PM stays in the PM
        // (some can only be given q24h, so it must not move to the AM).
        var dow = new Date(Date.UTC(1899, 11, 30) + (startSerial + dayOffset + d) * 86400000).getUTCDay();
        if ((dow === 0 || dow === 6) && am && pm) pm = '\u2014';
        xml = setCellXml(xml, box.grid + amRow, am);
        xml = setCellXml(xml, box.grid + pmRow, pm);
      }
    });
    return xml;
  }

  var CHARTS_BACKUP_KEY = STORAGE_KEY + '_backup';
  var CHARTS_BACKUP_MAX = 5;

  function loadChartBackups() {
    try {
      var raw = JSON.parse(localStorage.getItem(CHARTS_BACKUP_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }

  // A corrupted ldh_medcharts_v1 value (bad JSON, or valid JSON that isn't
  // an array) used to be silently treated as "no charts" — wiping every
  // saved 14-day chart across all four tools with no warning. Recover from
  // the newest pre-save snapshot instead, and say so loudly.
  function loadCharts() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('saved chart data was not a list');
      return parsed;
    } catch (e) {
      var backups = loadChartBackups();
      if (backups.length) {
        var latest = backups[backups.length - 1];
        if (latest && Array.isArray(latest.data)) {
          if (typeof alert === 'function') {
            alert('Your saved medication charts looked corrupted, so they\'ve been restored from an automatic backup taken ' + new Date(latest.ts).toLocaleString() + '. Please double-check everything below.');
          }
          return latest.data;
        }
      }
      if (typeof alert === 'function') {
        alert('Your saved medication charts looked corrupted and no automatic backup could be recovered — starting with an empty list. Sorry about this.');
      }
      return [];
    }
  }
  function saveCharts(list) {
    // Snapshot whatever was there immediately before overwriting it, so a
    // future corrupted read can be recovered from.
    var prevRaw = localStorage.getItem(STORAGE_KEY);
    if (prevRaw) {
      try {
        var prevParsed = JSON.parse(prevRaw);
        if (Array.isArray(prevParsed)) {
          var backups = loadChartBackups();
          backups.push({ ts: Date.now(), data: prevParsed });
          if (backups.length > CHARTS_BACKUP_MAX) backups = backups.slice(backups.length - CHARTS_BACKUP_MAX);
          localStorage.setItem(CHARTS_BACKUP_KEY, JSON.stringify(backups));
        }
      } catch (e) { /* don't block the real save over a backup failure */ }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
  // Dashboard hand-off (2026-09-26): registering (or correcting) a chart for
  // an animal that's flagged as a medication case on the LDH Shift Ops
  // dashboard used to need a SEPARATE manual step on the dashboard's own
  // vets.html (typing the label there again). She does all of the real
  // clinical work here instead, so this builds a short label straight from
  // what was just typed and sends it — same best-effort, fire-and-forget
  // sync as the tools' own completion sync (never blocks the local save,
  // never surfaces an error if it fails).
  //
  // The dashboard task might not be a medication case at all (no prior
  // staff flag), or might not exist there yet — the Edge Function only
  // UPDATEs a matching row, it never creates one, so this is a safe no-op
  // in both cases. A chart created directly on the Medication Charts page
  // (sourceTool 'manual') has no shift to match against, so it's skipped.
  var DASHBOARD_SHIFT = { 'sick-injured': 'sick_injured', processing: 'processing', surgery: 'surgery' };
  var SYNC_ENDPOINT = 'https://yeazfafvylawwgoxlhbl.supabase.co/functions/v1/clever-endpoint';
  var SYNC_APIKEY = 'sb_publishable_fow5B_VGO3gKPf4BaULsOQ_ZiSH8q8Y';
  function buildDashboardLabel(chart) {
    var base = chart.createdAt ? new Date(chart.createdAt) : new Date();
    return (chart.meds || []).map(function (m) {
      return labelFor(m, base, chart.startOption);
    }).filter(Boolean).join('; ');
  }
  // ---------- the long medication label, sent to the Welfare nurse (2026-10-21) ----------
  // e.g. "Meloxicam, give 1 tablet orally once daily with food for 5 days, stop if vomiting, diarrhoea, or not eating, review on 26/10".
  // One label per medication line. Goes to the Nurses page as a "Medication label to make" task with the animal ID, space and the
  // vet's initials; sending again after an edit updates the open task instead of adding another.
  function nurseLabelText(med, base, chartStart) {
    var name = String(med.drugLabel || '').trim();
    if (!name) return '';
    var give = [med.doseText ? 'give ' + med.doseText : '', routeWords(med.route), freqWords(med.freq)].filter(Boolean).join(' ');
    var days = parseInt(med.days, 10);
    var out = name + (give ? ', ' + give : '') + (needsFood(med) ? ' with food' : '') + (days ? ' for ' + days + ' day' + (days === 1 ? '' : 's') : '');
    var warn = String(med.drugWarning || '').split(/\s*\|\s*/).join('. ').split(/\.\s+/).map(function (w) { return w.trim().replace(/\.$/, ''); })
      .filter(function (w) { return w && !/given with food/i.test(w) && !/schedule 8/i.test(w); })
      .map(function (w) { return w.replace(/^STOP\b/, 'stop'); });
    if (warn.length) out += ', ' + warn.join(', ');
    var review = reviewDateText(med, base, chartStart);
    if (review) out += ', review on ' + review;
    return out.replace(/\s{2,}/g, ' ').trim();
  }
  function nurseLabels(chart) {
    var base = chart.createdAt ? new Date(chart.createdAt) : new Date();
    var out = [];
    (chart.meds || []).forEach(function (m, i) { var t = nurseLabelText(m, base, chart.startOption); if (t) out.push({ key: chart.id + '|' + i, text: t }); });
    return out;
  }
  function nurseLabelSig(chart) {
    var str = JSON.stringify([nurseLabels(chart), chart.location || '', chart.animalId || '', chart.vetInCharge || '']), h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return String(h);
  }
  function nurseLabelStatus(chart) {
    if (!String(chart.animalId == null ? '' : chart.animalId).trim()) return 'noid';
    if (!chart.nurseLabelSentAt) return 'notsent';
    return chart.nurseLabelSig === nurseLabelSig(chart) ? 'sent' : 'stale';
  }
  function nurseLabelBadge(chart) {
    if (!chart) return '';
    if (chart.nurseLabelErr) return '\u274c Label NOT SENT to the Welfare nurse (' + chart.nurseLabelErr + ').';
    var st = nurseLabelStatus(chart);
    if (st === 'sent') return '\u2705 Label sent to the Welfare nurse at ' + new Date(chart.nurseLabelSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.';
    if (st === 'stale') return '\u274c Changed since the label was sent to the Welfare nurse.';
    return '';
  }
  var nurseSending = {};
  function sendLabelsToNurse(chart) {
    if (!chart || nurseSending[chart.id]) return Promise.resolve(false);
    var labels = nurseLabels(chart);
    var id = String(chart.animalId == null ? '' : chart.animalId).trim();
    if (!id || !labels.length) return Promise.resolve(false);
    nurseSending[chart.id] = true;
    var sig = nurseLabelSig(chart);
    var fail = function (msg) { aaPatchChart(chart.id, { nurseLabelErr: msg }); return false; };
    return Promise.resolve().then(function () {
      return global.LDHSync.fetch({ method: 'POST', body: JSON.stringify({ nurse_label: { animal_id: id, location: chart.location || 'Location TBC', sent_by: chart.vetInCharge || '', labels: labels } }) });
    }).then(function (res) {
      if (res && res.ok) { aaPatchChart(chart.id, { nurseLabelSentAt: new Date().toISOString(), nurseLabelSig: sig, nurseLabelErr: '' }); return true; }
      return fail(res && res.status === 400 ? 'the dashboard did not accept it' : 'could not reach the dashboard');
    }, function () { return fail('no connection'); }).then(function (ok) { delete nurseSending[chart.id]; return ok; });
  }

  function syncChartToDashboard(chart) {
    try {
      var shift = DASHBOARD_SHIFT[chart.sourceTool];
      if (!shift || !chart.animalId || !chart.location) return;
      var label = buildDashboardLabel(chart);
      if (!label) return;
      LDHSync.fetch({
        method: 'POST',
        body: JSON.stringify({ chart: { title: chart.animalId, location: chart.location || 'Location TBC', shift: shift, med_label: label, med_chart_done: true } })
      }).catch(function () {});
    } catch (e) { /* never let the sync attempt break the local save */ }
  }
  // ---------- Excel export: exact clone of the real template (moved here from medication-charts.html 2026-10-18 so the
  // tools can attach the same file to an Admission AA card). One sheet per chart.
  var OOXML_PARTS_TO_REPLACE = new Set([
    'xl/worksheets/sheet1.xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml'
  ]);

  function xmlEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  async function buildWorkbook(charts){
    const templateBuf = await fetch(TEMPLATE_URL).then(r=>{
      if(!r.ok) throw new Error(`Could not load template (${r.status})`);
      return r.arrayBuffer();
    });
    const templateZip = await JSZip.loadAsync(templateBuf);
    const templateSheetXml = await templateZip.file(TEMPLATE_SHEET_PART).async('string');

    const usedNames = new Set();
    const sheetFiles = {};
    const sheetMeta = charts.map((c, i)=>{
      const num = i + 1;
      sheetFiles[`xl/worksheets/sheet${num}.xml`] = patchSheetXml(templateSheetXml, c);
      return { num, name: safeSheetName(c.animalId, usedNames) };
    });

    const sheetsXml = sheetMeta.map(s=>
      `<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="${xmlEsc(s.name)}" sheetId="${s.num}" state="visible" r:id="rId${s.num}"/>`
    ).join('');
    const definedNamesXml = sheetMeta.map(s=>
      `<definedName name="_xlnm.Print_Area" localSheetId="${s.num-1}">'${s.name.replace(/'/g,"''")}'!$A$1:$U$43</definedName>`
    ).join('');
    const workbookXml = `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><workbookPr/><workbookProtection/><bookViews><workbookView visibility="visible" minimized="0" showHorizontalScroll="1" showVerticalScroll="1" showSheetTabs="1" tabRatio="600" firstSheet="0" activeTab="0" autoFilterDateGrouping="1"/></bookViews><sheets>${sheetsXml}</sheets><definedNames>${definedNamesXml}</definedNames><calcPr calcId="124519" fullCalcOnLoad="1"/></workbook>`;

    const n = sheetMeta.length;
    const relsSheets = sheetMeta.map(s=>
      `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet${s.num}.xml" Id="rId${s.num}"/>`
    ).join('');
    const relsXml = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsSheets}<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml" Id="rId${n+1}"/><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml" Id="rId${n+2}"/></Relationships>`;

    const ctOverrides = sheetMeta.map(s=>
      `<Override PartName="/xl/worksheets/sheet${s.num}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join('');
    const contentTypesXml = `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${ctOverrides}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`;

    const outZip = new JSZip();
    for(const name of Object.keys(templateZip.files)){
      const entry = templateZip.files[name];
      if(entry.dir || OOXML_PARTS_TO_REPLACE.has(name)) continue;
      if(name === 'xl/styles.xml'){
        // show the weekday with each date ("Sat 17-Oct") so the weekend AM-only days are easy to see
        outZip.file(name, (await entry.async('string')).replace('formatCode="dd-mmm"', 'formatCode="ddd dd-mmm"'));
      } else {
        outZip.file(name, await entry.async('uint8array'));
      }
    }
    Object.keys(sheetFiles).forEach(fname=> outZip.file(fname, sheetFiles[fname]));
    outZip.file('xl/workbook.xml', workbookXml);
    outZip.file('xl/_rels/workbook.xml.rels', relsXml);
    outZip.file('[Content_Types].xml', contentTypesXml);

    return outZip.generateAsync({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }

  // ---------- Admission AA hand-off (2026-10-18) ----------
  // With the "Share this shift with Admission AA" switch on in Processing or Sick & Injured, saving (or editing) a
  // chart sends it to the Admission AA page as its own card (one live card per animal per day, so a re-save UPDATES it).
  // Sent only counts when the dashboard confirms (AAShare.send); otherwise the chart is NOT SENT and the tool shows
  // it in the red bar with a Resend button. Surgery and manual charts are never sent.
  var AA_TOOL_OF = { processing: 'processing', 'sick-injured': 'sick_injured' };
  var aaSendingCharts = {};
  var aaListener = null;
  function aaToolFor(chart) { return (chart && AA_TOOL_OF[chart.sourceTool]) || null; }
  function aaChartLines(chart) {
    var base = chart.createdAt ? new Date(chart.createdAt) : new Date();
    return (chart.meds || []).map(function (m) { return labelFor(m, base, chart.startOption); }).filter(Boolean);
  }
  // Covers everything that changes the Excel file, not just the drug lines (start day, weight, plan text).
  function aaChartSig(chart) {
    return global.AAShare.sig(JSON.stringify([aaChartLines(chart), chart.startOption, chart.weight, chart.problemList || '',
      (chart.meds || []).map(function (m) { return m.startOption; })]));
  }
  function aaChartStatus(chart) {
    if (!String(chart.animalId == null ? '' : chart.animalId).trim()) return 'noid';
    if (!chart.aaSentAt) return 'notsent';
    return chart.aaSig === aaChartSig(chart) ? 'sent' : 'stale';
  }
  function aaToday(chart) { return localDay(new Date(chart.createdAt || Date.now())) === localDay(new Date()); }
  // Charts this tool is responsible for right now: its own, saved today.
  function aaCharts(tool) {
    return loadCharts().filter(function (c) { return aaToolFor(c) === tool && aaToday(c); });
  }
  function aaChartSummary(tool) {
    var s = { sent: 0, unsent: 0, noid: 0 };
    aaCharts(tool).forEach(function (c) {
      var st = aaChartStatus(c);
      if (st === 'sent') s.sent++; else { s.unsent++; if (st === 'noid') s.noid++; }
    });
    return s;
  }
  function aaChartsToSend(tool) {
    return aaCharts(tool).filter(function (c) { var st = aaChartStatus(c); return st === 'notsent' || st === 'stale'; });
  }
  function aaPatchChart(id, patch) {
    var list = loadCharts(), i = list.findIndex(function (c) { return c.id === id; });
    if (i === -1) return;
    list[i] = Object.assign({}, list[i], patch);
    saveCharts(list);
  }
  // Read-back: mark charts entered (card gone) or waiting again, and save the change.
  function aaApplyCheck(tool, pending, nowISO) {
    var list = aaCharts(tool).filter(function (c) { return c.aaSentAt; });
    var before = list.map(function (c) { return c.aaEnteredAt || ''; });
    var n = global.AAShare.applyCheck(list, 'med_chart', pending, nowISO, function (c) { return c.animalId; });
    list.forEach(function (c, i) { if ((c.aaEnteredAt || '') !== before[i]) aaPatchChart(c.id, { aaEnteredAt: c.aaEnteredAt || '' }); });
    return n;
  }
  // One plain sentence on where a saved chart has got to with the Admission AA, shown under "Register medication chart".
  function aaChartLine(chart) {
    if (!chart) return '';
    var tool = aaToolFor(chart);
    if (!tool || !global.AAShare) return '';
    if (!global.AAShare.isOn(tool)) return 'Chart saved. It has NOT been sent to the Admission AA: the share switch is off.';
    var st = aaChartStatus(chart);
    var hm = chart.aaSentAt ? new Date(chart.aaSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    if (st === 'noid') return '\u274c Chart saved, but it has no animal ID so it cannot be sent to the Admission AA.';
    if (st === 'notsent') return '\u274c NOT SENT to the Admission AA' + (chart.aaErr ? ' (' + chart.aaErr + ')' : '') + '. Press Resend in the Share card.';
    if (st === 'stale') return '\u274c Changed since it was sent to the Admission AA. Press Resend in the Share card.';
    return chart.aaEnteredAt ? '\u2705 Done: the Admission AA has marked this chart as done.'
      : '\u23f3 Sent to the Admission AA' + (hm ? ' at ' + hm : '') + ' \u2713. Waiting for them to mark it done.';
  }
  // For the Medication Charts page, which lists charts from every day: a one-line "where has this got to" for a chart that has
  // been sent (or tried to be) to the Admission AA, whatever the share switch says now.
  function aaChartBadge(chart) {
    if (!chart || !aaToolFor(chart) || !global.AAShare) return '';
    if (!chart.aaSentAt) return chart.aaErr ? '\u274c NOT SENT to the Admission AA (' + chart.aaErr + ').' : '';
    if (aaChartStatus(chart) === 'stale') return '\u274c Changed since it was sent to the Admission AA.';
    var hm = new Date(chart.aaSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return chart.aaEnteredAt ? '\u2705 Done: the Admission AA has marked this chart as done.' : '\u23f3 Sent to the Admission AA at ' + hm + '. Waiting for them to mark it done.';
  }
  // What to ask the dashboard about: every chart that was sent.
  function aaSentPairs() {
    return loadCharts().filter(function (c) { return aaToolFor(c) && c.aaSentAt && String(c.animalId || '').trim(); })
      .map(function (c) { return { kind: 'med_chart', animal_id: c.animalId }; });
  }
  // Mark charts Done (the AA's card is gone) or waiting again (it came back), across all days. Returns how many changed.
  function aaApplyCheckAll(pending, nowISO) {
    var list = loadCharts().filter(function (c) { return aaToolFor(c) && c.aaSentAt; });
    var before = list.map(function (c) { return c.aaEnteredAt || ''; });
    var n = global.AAShare.applyCheck(list, 'med_chart', pending, nowISO, function (c) { return c.animalId; });
    list.forEach(function (c, i) { if ((c.aaEnteredAt || '') !== before[i]) aaPatchChart(c.id, { aaEnteredAt: c.aaEnteredAt || '' }); });
    return n;
  }
  function aaNotify() { if (typeof aaListener === 'function') { try { aaListener(); } catch (e) { /* display only */ } } }
  function aaBlobToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }
  // The card carries the drug lines AND the real Excel chart. If the Excel can't be built the send is reported
  // NOT SENT (with Resend) rather than quietly sending a card with no file.
  function aaSendChart(chart) {
    if (!global.AAShare || !chart || aaSendingCharts[chart.id]) return Promise.resolve(false);
    var lines = aaChartLines(chart);
    var body = global.AAShare.buildBody({ kind: 'med_chart', animal: chart, noteText: '', sentBy: chart.vetInCharge || '' });
    if (!body || !lines.length) return Promise.resolve(false);
    aaSendingCharts[chart.id] = true;
    aaNotify();
    var sig = aaChartSig(chart);
    var fail = function (msg) { aaPatchChart(chart.id, { aaErr: msg }); return false; };
    var done = function (ok) { delete aaSendingCharts[chart.id]; aaNotify(); return ok; };
    return buildWorkbook([chart]).then(aaBlobToB64).then(function (b64) {
      body.aa.payload = { lines: lines, xlsx_b64: b64 };
      return global.AAShare.send(body).then(function (ok) {
        if (ok) { aaPatchChart(chart.id, { aaSentAt: new Date().toISOString(), aaSig: sig, aaErr: '', aaEnteredAt: '' }); return true; }
        return fail(global.AAShare.lastError() || 'Not sent.');
      });
    }, function () { return fail("Couldn't build the Excel chart to send."); }).then(done, function () { return done(false); });
  }
  function aaAutoSend(chart) {
    try {
      var tool = aaToolFor(chart);
      if (tool && global.AAShare && global.AAShare.isOn(tool)) aaSendChart(chart);
    } catch (e) { /* never let the AA hand-off break the local save */ }
  }

  function addChart(chart) {
    var list = loadCharts();
    list.push(chart);
    saveCharts(list);
    syncChartToDashboard(chart);
    aaAutoSend(chart);
    return chart;
  }
  function deleteChart(id) {
    saveCharts(loadCharts().filter(function (c) { return c.id !== id; }));
  }
  // Replaces an already-saved chart's editable fields in place (the
  // Medication Charts page's Edit flow — changing drug/dose/route/duration/
  // start date on a chart after it was registered, without deleting and
  // re-creating it). `patch` is shallow-merged onto the existing record, so
  // callers only need to pass the fields they're changing (id/createdAt/
  // sourceTool/sourceAnimalId stay untouched unless explicitly overridden).
  function updateChart(id, patch) {
    var list = loadCharts();
    var idx = list.findIndex(function (c) { return c.id === id; });
    if (idx === -1) return null;
    list[idx] = Object.assign({}, list[idx], patch);
    saveCharts(list);
    syncChartToDashboard(list[idx]);
    aaAutoSend(list[idx]);
    return list[idx];
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

  // ---------- passive mg/kg annotation ----------
  // Reads the strength she already typed (e.g. "Amoxyclav 250mg") plus the
  // tablet/capsule count from the dose instruction, and the animal's own
  // recorded weight, then appends "(X mg/kg)" onto the drug label — no
  // separate calculator fields to fill in. Bare mg strength defaults the
  // quantity to 1 when the instruction doesn't name a tablet/capsule count,
  // which also makes it correct for a liquid dose already written as a
  // total mg amount (e.g. "Meloxicam 1.5mg: give 0.3ml PO SID"). A mg/mL
  // concentration (e.g. "Gabapentin 200mg/mL: give 0.3ml") instead needs an
  // EXPLICIT volume given — unlike the tablet-count default, a missing
  // volume here is never assumed, since guessing one could be wildly wrong.
  var STRENGTH_TOKEN_RE = /(\d+(?:\.\d+)?\s*mg)\b(?!\s*\/\s*kg)(?!\s*(?:\/|per|:)\s*1?\s*m[lL]s?\b)/i;
  var CONCENTRATION_TOKEN_RE = /\d+(?:\.\d+)?\s*mg\s*(?:\/|per|:)\s*1?\s*m[lL]s?\b/i;
  // Quantity before tablet/capsule. Different vets write a non-whole count
  // very differently, so all of these are accepted: a plain number ("2
  // tablets"), a mixed or simple numeric fraction ("1 1/2 tablets", "1+1/2
  // tablets", "1/2 tablet"), a fraction word ("half tablet", "half a
  // tablet", "quarter tablet", "three-quarters of a tablet"), or a spelled-
  // out whole-plus-fraction ("one and a half tablets", "one and quarter
  // tablet", "two and three quarters tablets"). A half tablet is half the
  // strength, so treating it as a whole tablet (the old behaviour, no match
  // -> default qty 1) silently doubled the computed mg/kg. Order matters:
  // each multi-word/multi-token alternative must come before the shorter
  // ones it contains, or e.g. "1 1/2" would be cut down to just "1", or
  // "one and a half" would never be tried because "half" alone matched
  // first partway through the phrase.
  var QTY_TOKEN_RE = /((?:one|two|three|four|five|six|seven|eight|nine|ten)\s+and\s+(?:an?\s+)?(?:half|quarter|three[\s-]?quarters?)|\d+(?:\.\d+)?\s*\+\s*\d+\/\d+|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|half|quarter|three[\s-]?quarters?)\s*(?:of\s+)?(?:an?\s+)?(?:tablets?|tabs?|capsules?|caps?)\b/i;
  var QTY_WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  function fractionWordValue(w) {
    if (w === 'half') return 0.5;
    if (w === 'quarter') return 0.25;
    if (/^three\s*quarters?$/.test(w)) return 0.75;
    return null;
  }
  function parseQtyToken(raw) {
    var s = String(raw || '').trim().toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ');
    var combo = /^(one|two|three|four|five|six|seven|eight|nine|ten)\s+and\s+(?:an?\s+)?(half|quarter|three\s*quarters?)$/.exec(s);
    if (combo) return QTY_WORD_NUMBERS[combo[1]] + fractionWordValue(combo[2]);
    var wordFrac = fractionWordValue(s);
    if (wordFrac != null) return wordFrac;
    var plus = /^(\d+(?:\.\d+)?)\s*\+\s*(\d+)\/(\d+)$/.exec(s);
    if (plus) return parseFloat(plus[1]) + parseFloat(plus[2]) / parseFloat(plus[3]);
    var mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
    if (mixed) return parseFloat(mixed[1]) + parseFloat(mixed[2]) / parseFloat(mixed[3]);
    var frac = /^(\d+)\/(\d+)$/.exec(s);
    if (frac) return parseFloat(frac[1]) / parseFloat(frac[2]);
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  var VOLUME_ML_RE = /(\d+(?:\.\d+)?)\s*m[lL]s?\b/i;
  // Matches an annotation this function itself inserted on an earlier pass,
  // so re-running it on already-annotated text (e.g. re-editing the same
  // field and blurring again) replaces the old figure instead of stacking
  // a second one next to it.
  var EXISTING_ANNOTATION_RE = /^ \(\d+(?:\.\d+)?mg\/kg\)/;

  // A handful of drugs are dispensed as a liquid at ONE known standard
  // concentration she never varies from, for one species — so "give 1ml"
  // with no strength/concentration stated at all can still be computed,
  // rather than skipped for lack of a number to multiply from. Species-
  // scoped deliberately: e.g. her Gabapentin liquid for cats is always
  // 200mg/mL, but the dog liquid varies, so no dog default exists here —
  // dog instructions still need the concentration typed out. An explicit
  // strength/concentration she DOES type always wins over this table; it's
  // only consulted when computeMgPerKg finds nothing else to go on.
  var DEFAULT_LIQUID_CONCENTRATIONS = {
    gabapentin: { cat: 200 } // mg/mL
  };

  // Drugs she doses as a flat per-animal amount rather than by weight (e.g.
  // Mirtazapine 1.88mg/cat, regardless of the individual cat's actual
  // weight) — a computed mg/kg figure would be misleading here, so these
  // are skipped entirely rather than annotated.
  var FLAT_DOSE_DRUGS = { mirtazapine: true, 'mirtazapine-transdermal': true };

  function tryDefaultConcentration(line, wNum, species) {
    if (!species) return null;
    var drug = findDrug(line);
    if (!drug) return null;
    var bySpecies = DEFAULT_LIQUID_CONCENTRATIONS[drug.key];
    var concVal = bySpecies && bySpecies[species];
    if (!(concVal > 0)) return null;
    var volM = VOLUME_ML_RE.exec(line);
    if (!volM) return null;
    var volMl = parseFloat(volM[1]);
    if (!(volMl >= 0)) return null;
    return { mgPerKg: (concVal * volMl) / wNum, insertAt: volM.index + volM[0].length };
  }

  function formatMgPerKg(n) {
    return String(Math.round(n * 10) / 10);
  }

  // Returns { mgPerKg, insertAt } for one instruction line, or null if it
  // can't be confidently computed (missing strength, mcg-based, a mg/mL
  // concentration with no stated volume, or no usable weight). `species`
  // is optional — only needed for the DEFAULT_LIQUID_CONCENTRATIONS
  // fallback below, and never affects the two explicit-number paths.
  function computeMgPerKg(line, weight, species) {
    var wNum = parseFloat(weight);
    if (!(wNum > 0)) return null;
    var flatDrug = findDrug(line);
    if (flatDrug && FLAT_DOSE_DRUGS[flatDrug.key]) return null;
    var parts = splitInstruction(line);

    // Matched against the whole line, not just `parts.head` — a colon used
    // as the concentration's own separator (e.g. "200mg:1mL give 0.25ml...")
    // would otherwise get cut in half by splitInstruction's colon-based
    // head/tail split before this regex ever saw it.
    var concM = CONCENTRATION_TOKEN_RE.exec(line);
    if (concM) {
      var concVal = parseFloat(concM[0]);
      // The administered volume always comes AFTER the concentration
      // expression in her phrasing — searching only the remainder avoids
      // re-matching the concentration's own "1mL" denominator as if it
      // were the dose volume.
      var afterConc = line.slice(concM.index + concM[0].length);
      var volM = VOLUME_ML_RE.exec(afterConc) || VOLUME_ML_RE.exec(parts.tail) || VOLUME_ML_RE.exec(line);
      if (!volM || !(concVal > 0)) return null;
      var volMl = parseFloat(volM[1]);
      if (!(volMl >= 0)) return null;
      return { mgPerKg: (concVal * volMl) / wNum, insertAt: concM.index + concM[0].length };
    }

    var m = STRENGTH_TOKEN_RE.exec(parts.head);
    if (!m) return tryDefaultConcentration(line, wNum, species);
    var mgVal = parseFloat(m[1]);
    if (!(mgVal > 0)) return null;
    var qtyM = QTY_TOKEN_RE.exec(parts.tail) || QTY_TOKEN_RE.exec(line);
    var qty = qtyM ? parseQtyToken(qtyM[1]) : 1;
    if (!(qty > 0)) qty = 1;
    return { mgPerKg: (mgVal * qty) / wNum, insertAt: m.index + m[0].length };
  }

  // Annotates every line of a multi-line Treatment/Plan block. Lines that
  // can't be confidently computed are returned unchanged (never a guess).
  // `species` is optional (existing call sites that don't pass it just
  // never trigger the default-concentration fallback, unchanged behaviour).
  function annotateMgPerKg(text, weight, species) {
    return String(text || '').split('\n').map(function (line) {
      if (!line.trim()) return line;
      var r = computeMgPerKg(line, weight, species);
      if (!r) return line;
      var rest = line.slice(r.insertAt);
      var existing = EXISTING_ANNOTATION_RE.exec(rest);
      var replaceEnd = existing ? r.insertAt + existing[0].length : r.insertAt;
      return line.slice(0, r.insertAt) + ' (' + formatMgPerKg(r.mgPerKg) + 'mg/kg)' + line.slice(replaceEnd);
    }).join('\n');
  }

  // Keeps ONE machine-computed medication (e.g. the auto oral-meloxicam
  // post-op course) in sync on an animal's chart, identified by a stable
  // `autoKey` — finds-and-updates only its own row, so it never disturbs
  // any other medication a vet has manually registered on the same
  // chart. Creates the chart if the animal doesn't have one yet.
  function upsertAutoMed(animalMeta, autoKey, medFields) {
    var list = loadCharts();
    var chart = list.find(function (c) { return c.sourceAnimalId === animalMeta.sourceAnimalId; });
    var med = Object.assign({ autoKey: autoKey, matched: true, s8: false, warnings: [], startOption: 'tomorrow' }, medFields);
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
      // keep whatever start day the row already had (incl. legacy "none")
      if (chart.meds[idx].startOption) med.startOption = chart.meds[idx].startOption;
      else if (medFields.startOption === undefined) delete med.startOption;
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
    var tool = AA_TOOL_OF[chart.sourceTool];
    var share = !tool || !global.AAShare ? ''
      : (global.AAShare.isOn(tool) ? '\n\nIt is being sent to the Admission AA. Its status shows under the "Register medication chart" button.'
                                    : '\n\nIt has NOT been sent to the Admission AA (the share switch is off).');
    return 'Medication chart saved. Open "Medication Charts" from the shift tools hub to review and export.' + share;
  }

  /* 2026-09-25: charts are printed, so they don't need to linger. The first
     time any tool/page is opened on a new day, offer to delete every chart
     saved before today (asked once per day; "Keep" waits until tomorrow).
     Deletion goes through saveCharts, so the automatic backup still applies. */
  function localDay(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function morningCleanupPrompt(onChange) {
    var LAST_KEY = STORAGE_KEY + '_lastcleanup';
    var today = localDay(new Date());
    try { if (localStorage.getItem(LAST_KEY) === today) return; } catch (e) { return; }
    var old = loadCharts().filter(function (c) {
      return c.createdAt && localDay(new Date(c.createdAt)) < today;
    });
    if (!old.length) { try { localStorage.setItem(LAST_KEY, today); } catch (e) {} return; }
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#222;max-width:420px;width:100%;border-radius:10px;padding:18px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)';
    var ids = old.map(function (c) { return (c.animalId || '(no ID)'); });
    var shown = ids.slice(0, 12).join(', ') + (ids.length > 12 ? ' … +' + (ids.length - 12) + ' more' : '');
    var p = document.createElement('p');
    p.style.margin = '0 0 8px';
    p.innerHTML = '<b>Good morning — ' + old.length + ' medication chart' + (old.length === 1 ? '' : 's') + ' from previous days ' + (old.length === 1 ? 'is' : 'are') + ' still saved.</b>';
    var p2 = document.createElement('p');
    p2.style.cssText = 'margin:0 0 14px;font-size:13px;color:#555';
    p2.textContent = shown + '. Charts are printed, so these are usually old animals. Delete them so they don\'t end up on today\'s printouts? (An automatic backup is kept.)';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
    function mk(label, primary, fn) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.style.cssText = 'padding:9px 14px;border-radius:8px;border:1px solid #1f7a4d;font:inherit;cursor:pointer;' + (primary ? 'background:#1f7a4d;color:#fff' : 'background:#fff;color:#1f7a4d');
      b.addEventListener('click', fn); return b;
    }
    row.appendChild(mk('Keep for now', false, function () {
      try { localStorage.setItem(LAST_KEY, today); } catch (e) {}
      wrap.remove();
    }));
    row.appendChild(mk('Delete ' + old.length + ' old chart' + (old.length === 1 ? '' : 's'), true, function () {
      var drop = {}; old.forEach(function (c) { drop[c.id] = true; });
      saveCharts(loadCharts().filter(function (c) { return !drop[c.id]; }));
      try { localStorage.setItem(LAST_KEY, today); } catch (e) {}
      wrap.remove();
      if (typeof onChange === 'function') onChange();
    }));
    box.append(p, p2, row); wrap.appendChild(box); document.body.appendChild(wrap);
  }

  global.MedChart = {
    morningCleanupPrompt: morningCleanupPrompt,
    STORAGE_KEY: STORAGE_KEY,
    DRUG_VOCAB: DRUG_VOCAB,
    S8_DRUG_NAMES: S8_DRUG_NAMES,
    DDBOOK_URL: DDBOOK_URL,
    TEMPLATE_URL: TEMPLATE_URL,
    TEMPLATE_SHEET_PART: TEMPLATE_SHEET_PART,
    MAX_MEDS_PER_SHEET: MAX_MEDS_PER_SHEET,
    parseMedPlan: parseMedPlan,
    buildLabelSentence: buildLabelSentence,
    labelFor: labelFor,
    reviewDateText: reviewDateText,
    annotateRecheck: annotateRecheck,
    putLabelsInNote: putLabelsInNote,
    aaChartLine: aaChartLine,
    aaChartBadge: aaChartBadge,
    aaSentPairs: aaSentPairs,
    aaApplyCheckAll: aaApplyCheckAll,
    recheckDisplay: recheckDisplay,
    computeGrid: computeGrid,
    medStartOffset: medStartOffset,
    chartBaseOffset: chartBaseOffset,
    gridShift: gridShift,
    gridOverflows: gridOverflows,
    startOverflowMessage: startOverflowMessage,
    patchSheetXml: patchSheetXml,
    safeSheetName: safeSheetName,
    loadCharts: loadCharts,
    saveCharts: saveCharts,
    addChart: addChart,
    updateChart: updateChart,
    deleteChart: deleteChart,
    buildWorkbook: buildWorkbook,
    aaChartStatus: aaChartStatus,
    aaChartSig: aaChartSig,
    aaApplyCheck: aaApplyCheck,
    aaChartSummary: aaChartSummary,
    aaCharts: aaCharts,
    aaChartsToSend: aaChartsToSend,
    aaSendChart: aaSendChart,
    nurseLabelText: nurseLabelText, nurseLabels: nurseLabels, nurseLabelStatus: nurseLabelStatus, nurseLabelBadge: nurseLabelBadge, sendLabelsToNurse: sendLabelsToNurse,
    aaIsSending: function (id) { return !!aaSendingCharts[id]; },
    onAaChange: function (fn) { aaListener = fn; },
    findChartBySourceAnimal: findChartBySourceAnimal,
    maxMeds: MAX_MEDS_PER_SHEET,
    upsertAutoMed: upsertAutoMed,
    removeAutoMed: removeAutoMed,
    saveConfirmationMessage: saveConfirmationMessage,
    uid: uid,
    computeMgPerKg: computeMgPerKg,
    annotateMgPerKg: annotateMgPerKg
  };
})(window);
