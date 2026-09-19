# Help disclosure audit, 2026-09-19

Every screen in `src/sections` was read against one question: does a first-time administrator meet a concept here that the screen itself does not explain? Where the answer was yes, the screen received one help disclosure. Where the answer was no, this file records why.

The rule comes from `design-system/tokens.md`, Help disclosure: a labelled button opens one collapsed callout beside the control it explains, at most one per screen, two or three short paragraphs, and the last paragraph can carry one example from the sample tenant. A consequence that changes what a press does belongs in the confirm dialog or in the result, never only here.

Counts: 25 screens read. 6 already carried one. 8 received one. 11 were left without one on purpose.

## Already present before this pass

| Screen | Label | Concept |
| --- | --- | --- |
| Access, Grants | How access works | Grants are additive, and a scope limits what one grant covers. |
| Access, Grants, broader panel | What is this? | A grant with no scope covers every record, including later ones. |
| Access, Overview | How access works | The same rule, read from the How column. |
| Tenant settings | What is searched | The search reads names, descriptions, and keywords, never a saved value. |
| Group inspector | How group access works | Membership gives access, and a direct role is the exception. |
| Person inspector, Roles tab | How this adds up | Direct roles and group roles combine. |
| Roles directory | How roles work | A role is a bundle of permissions, and Access gives it to somebody. |

The Grants screen carries two. That predates this pass and stays, because the second one explains the broader-access panel and opens only inside it.

## Added in this pass

| Screen | Label | Why a first-time user needs it |
| --- | --- | --- |
| Modules | What a module is here | The list is the deployed image, so nothing can be added from the screen. Switching a module off keeps its data. The Access column only reads. |
| Categories | What the counts mean | The count counts modules only, because a solution's category belongs to the solutions admin. Deleting a category deletes nothing else. Other is fixed. |
| Audit log | Why a row can look incomplete | An event is never edited. A target links only while the record exists and its module returns a path. An erased person reads as an anonymous name. |
| People directory | Pending, disabled, removed | Pending ends at first sign-in and not by hand. Disable and Remove differ in what they keep. Erasure is an operator command. |
| Groups directory | Directory and local groups | A directory group is read-only and owned by the identity provider. Archive keeps the assignments of a stale group and gives nothing. |
| Solutions, admin | What members see | Draft is administrators only, and Archived keeps the data. A status never grants access. A preview is recorded and counts as nobody's access. |
| Chat themes | How a theme reaches a solution | A theme applies only when a solution names it. Tenant branding is a starting point, not a saved row. A theme in use cannot be deleted. |
| Branding | How publishing works | The draft lives in the browser and nobody else sees it. One Publish writes every field at once. Restore fills the draft and does not publish. |

## Left without one, and why

| Screen | Reason |
| --- | --- |
| Role detail | The page already explains entitlement twice: a warning note per module that the tenant is not entitled to, and a blue note about keys added by entitlement. A third explanation would repeat what is on screen. |
| Tenant settings, other cards | The screen holds its one disclosure already. Each card carries its own note, for example the range note on Idle timeout. |
| Assign items | It sits under Categories and shares that screen's disclosure. Its own footer already says why a module can be absent. |
| Solutions hub, Favorites | Member screens. The one rule worth stating, that the first six favorites appear in the pinned rail, is already a line above the list. |
| Solution viewer | The unusual state, a resumed conversation with no earlier messages, is stated in the welcome block where it happens. |
| Account page | Each block carries its own note, for example that profile fields change in the company directory. |
| Inbox, Solutions empty state, Idle timeout modal | One purpose each, and no derived rule to explain. |
| Sign-in, break-glass, limited session, not set up | Auth cards. Every rule that matters is in the card copy, and a collapsed panel on a sign-in step would compete with the one action. |
| Email gallery | A design artifact and a development preview, not a product screen. The Keycloak group is already labelled in the list. |

## Two fixes this pass also made

A right-aligned panel ran off the left edge of a 390px screen, because a toolbar row wraps and the button lands at the start of a line. The panel now returns to the left edge under 640px. The change is in all five copies of `HelpNote`, so the copies stay identical.

`design-system/tokens.md` named two copies of `HelpNote`. There are five: access, people, audit and tenant settings, solutions, and branding. The line now names all five, and they still become one component in `packages/ui` after the export.

## Verified

Every new disclosure was opened at 1440px and at 390px. The panel stays inside the viewport at both widths, no page error was raised, and the project typecheck passes. The panel keeps the pattern's behavior: click, tap, Enter, and Space open it, Escape and a click outside close it, and it carries `aria-expanded`, `aria-controls`, and a `role="group"` panel with the same label.
