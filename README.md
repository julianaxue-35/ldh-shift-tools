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

## Share with Admission AA (Processing, 2026-10-18)

On the Incomplete tab, **Share this shift with Admission AA** is off by default. While it is on, each animal you register is sent to the Admission AA page as a task to enter in ShelterMate (notes text plus a one-animal Word file). Finish the notes before you register. Animals already registered when you switch on are sent straight away.

A send only counts once the dashboard confirms it saved. Anything else shows as **NOT SENT** (or "changed since sent" if the note was edited afterwards) with a Resend button, a red bar stays up, and Export / Share / Clear ask first if anything is unsent. Nothing is queued in the background. Clear list turns the switch off.

Roll out in order: migration 0018 → deploy the updated Edge Function code (the live function is named `clever-endpoint`; its source is `supabase/functions/sync-completion` in the dashboard repo) → dashboard → these tools. Tests: `node --test tests/*.test.mjs` and `NODE_PATH=<playwright path> node tests/processing-aa.test.js`.
