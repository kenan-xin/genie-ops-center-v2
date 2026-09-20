# Business stories and core flows

This folder captures platform-wide business use cases: who needs an outcome, what starts the journey, what the person does, what the system does automatically, and what happens when something goes wrong. Preserve useful product walkthroughs here instead of leaving them only in chat or technical policy documents.

These are product behavior documents, not implementation tickets, test results, or Storybook component stories. Accepted behavior does not mean the associated specification or implementation has been approved or completed.

## Index

| Flow document | Business question | Requirements and proof |
| --- | --- | --- |
| [Tenant module visibility](tenant-module-visibility.md) | How does a tenant receive only its modules and shared core, with each person limited by permissions? | Canonical invariant; Spec 0 AC-4/AC-17/AC-24, Spec 3 R-28/R-30 and existing access/lifecycle contracts |
| [Categories and Settings](categories-and-settings.md) | How does one admin organize modules and solutions, and find settings as modules grow? | Spec 0 R-56/AC-29; Spec 3 R-75a/R-91a/AC-19; Spec 4 R-37a/AC-13a |
| [Module activation, permission upgrades and removal](module-access-upgrades.md) | What changes automatically during upgrades, and what remains under administrator control? | Sections 1–5; exact R/AC mapping in the document |

Related existing material: screen-level User Flows in [design sections](../design/README.md), module behavior in [module documents](../modules/README.md), and operator procedures in [runbooks](../runbooks/README.md). These remain in place; this index is not a claim that their behavior has been re-reviewed.

## Ownership and traceability

- `docs/flows/`: platform-wide and cross-section journeys. Keep one bounded file per business concern, not one file per click or one enormous catalogue.
- `docs/modules/<capability>/`: module-specific stories/flows, linked from this index as they are authored. Illustrative examples in a platform flow do not define a deferred module's product requirements.
- `docs/specs/`: normative numbered requirements and acceptance criteria. Every accepted flow links to its owning R/AC identifiers, and affected specs link back to the flow. Missing coverage is identified explicitly, not invented.
- `docs/architecture/` and decisions: technical constraints, policy and rationale. Link rather than copying mechanisms into a business walkthrough.
- `docs/design/`: screen composition, controls and visual states that realize the flow. New behavior requires design alignment; a flow document alone does not prove the screen supports it.
- Beads: implementation work and progress. These files are not task tracking.

When changing behavior, update the affected flow, requirements/acceptance mapping, and design implications together. If they disagree, resolve the conflict by the accepted decision; do not silently treat either prose or a screenshot as a new approval. Preserve stable scenario IDs so tests, design handoffs, and future discussions can cite them.

## Format for a flow

Use a stable ID and a descriptive title. State whether the behavior is accepted, proposed, or unresolved, and whether implementation is verified separately. Include:

1. Actor and need, in plain language.
2. Starting conditions and trigger.
3. Short numbered walkthrough: user action and system response.
4. Successful outcome, automatic changes, and what remains administrator-controlled.
5. Relevant alternate/error paths; explicit open decisions where behavior is not settled.
6. Links to owning requirements, acceptance criteria, policy, and affected design. Record the proof required, not a claim that tests already exist.

Do not copy implementation algorithms or prescribe new UI controls merely to fill the template. Short scenarios may share actor/context and traceability tables. Add new scenarios when a real business decision warrants them, not speculative catalogues of future modules.
