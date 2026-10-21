# Sign-in setup guides

One guide per sign-in scenario, written for the person who does the setup, in the order they do
it, with every value they must copy. Start at `choose-your-setup.md`: three questions lead to the
one guide that fits.

A guide describes only what ships and is tested. It ships in the same change as the end-to-end
test that walks its promise, so a guide never describes something untested. When a scenario is not
built yet, its guide is not here; `choose-your-setup.md` lists it as coming instead.

## What belongs here

- One `s-<scenario>-<short-name>.md` per scenario, named in the scenario plan.
- `choose-your-setup.md`, the chooser that leads a reader to one guide, listing only the guides
  that exist and marking the rest as coming.

## What must not go here

- Operator procedure detail. The realm, the identity provider and the deployment runbooks live in
  [`docs/runbooks/`](../../runbooks/); a guide links to them rather than repeating them.
- Decisions, specifications, requirement numbers as authority, or implementation notes. Those live
  in [`docs/core/`](../../core/) and [`docs/architecture/`](../../architecture/). (A guide may name
  the requirement it satisfies in a link, the way the runbooks do.)
- Customer names, credentials, secrets, real hostnames, or any value a reader must not copy as-is.
- Module content. Platform sign-in is core.
