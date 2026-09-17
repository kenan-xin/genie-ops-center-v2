# Design

Delivered by the design owner: the fixed token layer, the shell, one design per core roadmap section in `../core/roadmap.md`, and one design per module phase in `../modules/<module>/README.md`. Each design is reviewed against its section or phase before implementation.

Handover rule: on every handover the design owner copies the text of the design tree's `product/` folder into this folder: the section specifications, the `types.ts` files, the `data.json` files, `design-system/tokens.md`, and `shell/spec.md`. The captures stay in the design tree and are referenced by their path there, so a reviewer opens them where they live. The text is what drifts and what a `DEC-` change must be checked against, so a reviewer can do that check in one repository and one pull request. A decision in `../core/decision-log.md` that changes a screen names the files here on its `Design files affected` line, and the next handover carries the change.
