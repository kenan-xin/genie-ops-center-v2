# Storybook dependency-story cache invalidation

Fix for story-cache invalidation (`genie-ops-center-v2-4w0`), based on S0-02 `556289c`. Pending independent review and integrated acceptance; G1 remains open.

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

Raw transcripts and probe scripts are supplementary local evidence in the Traycer `story-cache-fix` artifact. The command and procedure above are portable and require only the repository toolchain. This proof is not the full S0-10 selection matrix or G1 integrated acceptance.

## Additional checks

Uncached Nx lint, typecheck, test, validate, build-storybook and test-storybook passed across seven projects after restoration. Formatting and git diff --check passed. No dependency manifest, lockfile, production named input or discovery/selection code changed. No commit, merge, push, sync or hook activation. Independent review pending.
