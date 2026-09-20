# Child-process deployment environment proof

Follow-up `genie-ops-center-v2-1rd.3.5`, baseline `d20bc26`, 2026-09-21.
The test-only probe accepts an optional explicit environment, retaining inherited
environment behavior for existing callers.

For each build-safe public subpath, the test places sentinel values for
DATABASE_URL, PUBLIC_URL, KEYCLOAK_URL and BETTER_AUTH_SECRET in the parent,
then passes a copied environment with those keys deleted. Before importing the
entrypoint, the child checks key absence with Object.hasOwn and throws if any
key exists, including an empty string. After importing, it emits an absence
confirmation which the parent asserts alongside the existing no-driver and
no-connection report. Parent values are restored by the existing Vitest cleanup.

Removing only the explicit environment forwarding from execFileSync causes both
build-safe entrypoint cases to fail; the two detector controls still pass
(2 failed, 2 passed). Restoring the helper bytes restores success.

Uncached Nx core lint, typecheck and test passed (13 files, 146 tests), and
root format:check passed (118 files). No production code or deployment environment
validation policy changed; this closes the evidence gap in the existing proof.
