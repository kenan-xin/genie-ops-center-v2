# Storybook dependency-story cache invalidation

Fix for story-cache invalidation (`genie-ops-center-v2-4w0`), based on S0-02 `556289c`. Independent review approved the fix; integrated acceptance at `ae00f6b` closed this defect and G1. See [integrated acceptance](integrated-acceptance.md). The measurements below preserve the original branch proof.

Both Storybook targets use `^default` instead of `^production`, so dependency story files and their fixtures contribute to the cache key. The normal production exclusions, selection input, graph/discovery, outputs, pins and single test runner are unchanged. This deliberately trades additional cache misses on unrelated dependency test/documentation edits for complete dependency inputs; it introduces no global workspace or customer story glob. S0-10 still owns the full selection/confidentiality matrix.

## Executed cache proof

Run from the S0-02 repository root, with the Nx daemon disabled for the probe:

```bash
NX_DAEMON=false pnpm exec nx run-many --projects=@genie/storybook -t build-storybook test-storybook --output-style=static
```

Caching stays enabled throughout this sequence; no `--skip-nx-cache` is used.

| State | Observed result |
| --- | --- |
| Before fix, warm and repeat | Both targets pass with 2/2 cache hits |
| Before fix, change UI story title and deliberately fail its interaction | Both targets incorrectly return cached success, 2/2 hits |
| After fix, warm | Both execute successfully, 0/2 hits |
| After fix, repeat identical inputs | Both reuse cache, 2/2 hits |
| After fix, same meaningful story mutation | Static build executes and generated index contains UI/DisclosureCacheProof; component target executes and fails the injected aria-expanded assertion: 1 failed, 10 passed |
| Restore original story bytes, then repeat | Both return correct original cached successes, 2/2 hits on each run |

The mutation changes `UI/Disclosure` to `UI/DisclosureCacheProof` and replaces the Closed story's expected `aria-expanded` value with `CACHE_PROOF_FAILURE`. Restoration was byte-identical (SHA256 0bff68fd9877fff36b9322feba2ebe0e84e5f6fc3e85b7842c8fec05e68a63da). The mutation is not retained in source. Failed-run Nx cache summary counts only the successful task (0/1); neither task reports a cache hit, and the browser assertion failure proves execution. Generated static index verification proves the build uses the changed title.

The command and procedure above require only the repository toolchain. Integrated repetition is recorded in [integrated acceptance](integrated-acceptance.md); neither proof covers the full S0-10 selection matrix.

## Additional checks

Uncached Nx lint, typecheck, test, validate, build-storybook and test-storybook passed across seven projects after restoration. Formatting and git diff --check passed. No dependency manifest, lockfile, production named input or discovery/selection code changed. No commit, merge, push, sync or hook activation. That was the pre-review branch state; subsequent review and integration are recorded above.
