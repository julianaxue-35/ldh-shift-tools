# LDH Shift Tools

Three offline, single-file HTML shift-recording tools for The Lost Dogs' Home Cranbourne:

- **`surgery.html`** — desexing shift (castrate / cryptorchid / spey / pregnant spey / pyometra): dosing, vitals log, post-op.
- **`sick-injured.html`** — ward round shift: AA Vet Flag Log / Vet Reminder Report import, assessment, treatment plan.
- **`processing.html`** — intake shift: In Care Inventory import, physical exam, pathway and procedures.

`index.html` is a small hub linking to all three.

## How it works

Each tool is a self-contained HTML file — no server, no build, no install. All shift data (animals, exam notes, weights) is stored **only in the browser's local storage on the device that opened it**; nothing is sent anywhere. Export to Word (`.doc`) and Excel (`.xlsx`/`.csv`) downloads a file to the device, and each tool also has a **Share / Email** button that hands both files to the device's native share sheet (needs the page opened over `https://`, which GitHub Pages provides — it does not work if the raw file is opened locally).

Each tool has its own **Clear list** button — once a shift's Word/Excel has been sent, clear the list so the next shift starts empty.

## Mobile

All three are responsive for phone/tablet use: a top tab bar (Shift List / Exam / Export) replaces the old single long scroll, two-column forms stack to one column under ~600px, and dense data tables become stacked cards on phone width.

## Access

Gated client-side with an access code (shared with the other LDH internal tools) so the public GitHub Pages URL isn't casually discoverable. This is not real security — it only deters accidental discovery, since the code and gate logic are visible in the page source. Don't put anything more sensitive than routine shift/clinical notes through it.

## Colour coding

Surgery is blue, Sick & Injured is orange, Processing is green — otherwise identical layout/behaviour, built from the same base template.

---

© 2026 Juliana Xue. All rights reserved. This work is the intellectual property of Juliana Xue and
may not be copied, modified, distributed or used without her express written permission, except by
her current employer for as long as she remains engaged there.
