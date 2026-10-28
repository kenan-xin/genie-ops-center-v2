# Design import, 2026-10-28: the branding drop zone captures

Status: imported reference snapshot. It is not blanket design approval. The [2026-10-28 batch 5 rules import](2026-10-28-batch-5-rules.md) stays the record for the drop zone rule itself.

## Owner decision

The batch 5 fix list, row "Drop zones" (owner, 2026-10-27): the empty image slot must read as a drop target in light and dark, and the branding captures that show a drop zone change with it. The build now follows `tokens.md` "Drop zone" (v2 commit `d12cc371`).

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, branch `chore/product-baseline`, commit `c8300ae` (`docs(product): capture the branding drop zone from the build`). The mapping is `product/<path>` to `docs/design/<path>`. HEAD reproduces these four files. The workspace still holds uncommitted files under `src/` and elsewhere; this import does not take them.

The captures come from the running build (the dev app of the batch 5 worktree, Branding, Identity tab), not from the workspace preview app. They show the development tenant, which has no images set, so every slot shows the empty zone. Each file keeps its old size.

| File | Size | SHA-256 of the imported file |
| --- | --- | --- |
| `sections/branding/branding-identity.png` | 1280 x 900, light | `656b27a6c963074bdae3f3b87d6caed8d24f4cec49bed8c6bb2107f75dc05687` |
| `sections/branding/branding-identity-dark.png` | 1280 x 900, dark | `4f972af5d90d42651a58d8692e53cc66f3321d49b834499def45e830dd7b6f29` |
| `sections/branding/branding-identity-mobile.png` | 390 x 1374, light | `4c3f91117559bf62d0133cf76542e0c9e5658d55a787509a093569d05e7a59b2` |
| `sections/branding/branding-identity-mobile-preview.png` | 390 x 1500, light | `8f89196085412d6ab3d09b190b8759039b7e44ca56e8f8fa2cc98c81186a1696` |

## Limitations

- The old captures showed sample images in three slots (sample tenant data). The new captures show no image in any slot, so they no longer show the filled slot with Replace and Remove. The upload captures (`branding-upload-progress.png`, `branding-upload-infected.png`) still show filled slots and no empty zone, so they did not change.
- The development build draws the TanStack Devtools button in the lower right corner. It is not part of the product.
- The build has three tabs (Identity, Colors, Sign-in); the old captures showed the seven tabs of the target design. That difference predates this import.
