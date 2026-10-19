# LDH Shift Tools

Three offline, single-file HTML shift-recording tools for The Lost Dogs' Home Cranbourne:

- **`surgery.html`** — desexing shift (castrate / cryptorchid / spey / pregnant spey / pyometra): dosing, vitals log, post-op.
- **`sick-injured.html`** — ward round shift: AA Vet Flag Log / Vet Reminder Report import, assessment, treatment plan.
- **`processing.html`** — intake shift: In Care Inventory import, physical exam, pathway and procedures.

`index.html` is a small hub linking to all three.

## How it works

Each tool is a self-contained HTML file — no server, no build, no install. Full shift records (animals, exam notes, weights) are stored **only in the browser's local storage on the device that opened it**. To keep the Shift Ops dashboard live, the tools send it a short summary per animal (animal ID, location, shift, done status, and for flagged animals a brief medication, treatment and plan note) through the sync Edge Function. Export to Word (`.doc`) and Excel (`.xlsx`/`.csv`) downloads a file to the device, and each tool also has a **Share / Email** button that hands both files to the device's native share sheet (needs the page opened over `https://`, which GitHub Pages provides — it does not work if the raw file is opened locally).

Each tool has its own **Clear list** button — once a shift's Word/Excel has been sent, clear the list so the next shift starts empty.

## Mobile

All three are responsive for phone/tablet use: a top tab bar (Shift List / Exam / Export) replaces the old single long scroll, two-column forms stack to one column under ~600px, and dense data tables become stacked cards on phone width.

## Access

One LDH access code opens all the tools and the dashboard. The code is **not** stored in this repo: the gate checks it against the dashboard server (the sync Edge Function's `SYNC_SECRET`), then remembers it on that phone, where it doubles as the dashboard sync code (`sync-code.js`). The Vet and Nurse dashboard pages each have an extra passcode on top.

To change codes, see `supabase/rotate-codes.sql` in the ldh-shift-ops repo. When the LDH code changes, every phone is asked for the new code on its next sync. This is lightweight protection, suited to routine shift notes; it stops casual access, not a determined attacker.

## Colour coding

Surgery is blue, Sick & Injured is orange, Processing is green — otherwise identical layout/behaviour, built from the same base template.

---

© 2026 Juliana Xue. All rights reserved. This work is the intellectual property of Juliana Xue and
may not be copied, modified, distributed or used without her express written permission, except by
her current employer for as long as she remains engaged there.

## Share with Admission AA (Processing and Sick & Injured, 2026-10-18)

On the Incomplete tab of both Processing and Sick & Injured, **Share this shift with Admission AA** is off by default. While it is on, each animal you register is sent to the Admission AA page as a task to enter in ShelterMate (notes text plus a one-animal Word file). Finish the notes before you register. Animals already registered when you switch on are sent straight away.

A send only counts once the dashboard confirms it saved. Anything else shows as **NOT SENT** (or "changed since sent" if the note was edited afterwards) with a Resend button, a red bar stays up, and Export / Share / Clear ask first if anything is unsent. Nothing is queued in the background. Clear list turns the switch off.

Roll out in order: migration 0018 → deploy the updated Edge Function code (the live function is named `clever-endpoint`; its source is `supabase/functions/sync-completion` in the dashboard repo) → dashboard → these tools. Tests: `node --test tests/*.test.mjs` and `NODE_PATH=<playwright path> node tests/processing-aa.test.js` and `tests/si-aa.test.js`.

**Medication charts (phase 2c):** with the share switch on, saving or editing a chart in Processing or Sick & Injured sends it to the AA page as a `med_chart` card (drug lines; a re-save updates the same card). Surgery and manual charts are never sent. Status, red bar, Resend and the export/Clear warnings cover charts too. Test: `NODE_PATH=<playwright path> node tests/chart-aa.test.js`.

**Entered in ShelterMate / end-of-shift check / daily initials (2026-10-19):** the tools ask the dashboard (Edge Function shape `aa_check`) which sent cards are still waiting; a card that is gone was ticked by the AA, so the animal/chart shows "Entered in ShelterMate". The Share card has "Check what the AA has entered" and "End-of-shift check" (lists not registered / NOT SENT / waiting / entered). Vet initials are cleared on the first load of each new day and the vet is asked for them again (`ldh_processing_vetinit_v1_day`). Deploy the Edge Function first. Test: `NODE_PATH=<playwright path> node tests/entered-aa.test.js`.

**Dashboard list sync (2026-10-19):** Processing and Sick & Injured keep the dashboard in step through `dash-sync.js`. An animal with only an ID is sent under the placeholder location "Location TBC" (so it counts when registered); editing the ID or location removes the old dashboard case and adds the new one; an animal added by hand appears once it has an ID; Remove and Clear list take unfinished animals off the dashboard (registered ones stay as completed). Animals added with "Also add to the dashboard" unticked are left off. Test: `NODE_PATH=<playwright path> node tests/dash-sync-pages.test.js` and `node --test tests/dash-sync.test.mjs`.

**Recheck dates in the note, chart status, dashboard flags (2026-10-19):** the Plan / Treatment boxes add `(recheck d/m)` to medication lines that say `for N days` (`MedChart.annotateRecheck`, recomputed when the days change; her own review/recheck wording is left alone). Under "Register medication chart" a status line says whether the chart was sent to the Admission AA and whether they have marked it Done (`MedChart.aaChartLine`). (A "mark the dashboard flag done from Processing" idea was built and then removed at Juliana's request; the quick note is on the dashboard's Done box instead. The Edge Function still has the unused `flag_check` / `flag_done` shapes.) Tests: `recheck.test.js`.
