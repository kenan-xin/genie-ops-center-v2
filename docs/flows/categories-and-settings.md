# Categories and Settings

Accepted by the product owner on 2026-09-19. Implementation and design-import verification remain separate; these are business flows, not tickets.

## CF-CS-01 — Organize modules and solutions together

An administrator opens Categories, selects Finance and uses Assign items to move a whole module and an individual solution into that category in the same searchable transfer list. Core saves the module placement; Solutions checks its own permission and saves the solution placement. The administrator does not navigate to a separate module-specific categorization screen. Placement changes navigation organization, never access grants.

The page requires `core:settings:manage`; solution rows additionally require `solutions:admin`. Refused rows report failure and can be retried without pretending the entire mixed batch was atomic. Disabled modules keep record placement but supply no editable record rows; their whole-module placement remains available where a static entry exists. Excluded modules contribute nothing. Deleting a category leaves entries ungrouped, touches no module table and retains module-only summary counts.

Proof: Spec 0 R-56/AC-29 declares the seam; Spec 3 R-91a/AC-19 proves generic provider composition, permissions and mixed-list UX; Spec 4 R-37a/AC-13a proves real Solutions behavior.

## CF-CS-02 — Find and configure a setting

A settings administrator opens Navigator A, searches a setting name with a minor typo, and opens the matching section/field. Only the selected form renders in the detail area; phone navigation uses list/detail. Search covers names, descriptions and keywords, never saved configuration values or secrets.

Every section requires `core:settings:manage` plus any declared extra permission. A module administrator lacking that core permission cannot enter through search or a direct link. Unauthorized metadata never reaches the browser. A compiled disabled module can be configured before enablement; Save never enables it or completes a required reintroduction review. Excluded modules and modules without schemas have no section. Save/refusal is section-local and preserves edits; leaving dirty edits asks for confirmation. No-match and stale-link states are explicit.

Proof: Spec 0 R-56/AC-29 declares metadata and permissions; Spec 3 R-72/R-75/R-75a/R-79/AC-19 owns runtime authorization, search, focus, independent saves and phone/desktop evidence.

## Design handoff

The design reference must retain the single mixed Categories page and Navigator A. Check its types, fixtures and screens against these accepted boundaries at import. This document does not update screenshots or certify the current reference. No new transport endpoint, storage schema or richer form engine is prescribed.
