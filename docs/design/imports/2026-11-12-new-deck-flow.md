# Design import, 2026-11-12: New deck from a description

Status: imported reference snapshot of the design direction that the owner reviewed for S7-48, re-imported on 2026-11-13 after the polish. The plan of bead `czjw.174` builds from it.

The polish of 2026-11-13: the composer takes the place of the New deck button, and Cancel brings it back with focus; the title is plain text until the run ends and renames only after it; Stop keeps the drafted slides and reads "Stopped, n slides kept"; the status reads "Drafting slide n" with one placeholder after the drafted slides; Present is disabled while the deck has no slides; the deck header has More actions and the "Slide n of m" and Undo row; the agent panel header matches the real panel; on a phone the content leaves room for the agent sheet. Screenshots of the polished states are in `Working/screenshots/new-deck-flow/` of the main checkout, which git does not track.

## Source and method

Source: `Working/prototypes/new-deck-flow.prototype.html` in the main checkout `/home/kenan/work/genie-ops-center-v2`, a folder that git does not track. The file was copied as it is into `prototypes/`. It holds no captures, so this import adds none. The data is fictional sample data.

## States

The bar at the top of the file switches the step and the viewport: 1 Describe, 2 Drafting, 3 Ready, and Desktop or Phone.

## Files

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `prototypes/new-deck-flow.prototype.html` | Added 2026-11-12, replaced 2026-11-13 | `8c82289bf095b9e446e53185fc96e60eda4ab441fe240bed7a856cd4aa65be1c` |
