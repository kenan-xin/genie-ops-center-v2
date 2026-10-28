# Design import, 2026-10-28: the sign-in stack captures

Status: imported reference snapshot. It is not blanket design approval. The [2026-10-28 batch 5 rules import](2026-10-28-batch-5-rules.md) stays the record for the sign-in redesign rule itself.

## Owner decision

The batch 5 fix list, rows "Sign-in pages (redesign)", "Password step: Meets the rule" and "Password reveal with Input Group" (owner, 2026-10-27): the sign-in page, its Branding preview and the break-glass door use one centered stack with no card (approved direction D2). The build follows it from v2 commits `7d15cf52`, `50b5723a` and `5ca4b84d`. The 44px phone height of the sign-in buttons follows the touch-target rule in `DESIGN.md`.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, branch `chore/product-baseline`, commit `09c2cdc` (`docs(product): capture the sign-in stack from the build`). The mapping is `product/<path>` to `docs/design/<path>`. HEAD reproduces these files. The workspace still holds uncommitted files under `src/` and elsewhere. This import does not take them.

The captures come from the running build of the batch 5 worktree, not from the workspace preview app. Each file keeps its old name and size.

- The sign-in page states come from the dev app: `/sign-in` and `/sign-in?error=<cause>` for `signed_out`, `session_expired`, `not_registered` and `access_disabled`.
- The break-glass credentials step comes from the dev app at `/admin/login`.
- The two-entry page (`SignInView` story `SsoAndLocalAccounts`) and the break-glass error, rate-limited, code, password-change and enrollment steps (`Core/Break-glass sign-in` stories) come from Storybook. The development tenant has no local accounts, and those door steps need a break-glass session. The error capture sets the story's `error` arg to "Invalid email or password.", the text that `/admin/login` shows.

Text changes in the same commit:

- `spec.md`: the captures note, the 44px phone touch target, the welcome line that a tenant sets, the checklist that replaces the strength meter and "Meets the rule", and the "Why am I here?" help that replaces the setup footer note.
- `data.json`: `signInState` names the notice between the heading and the buttons, not the top of a card.

| File | Size | SHA-256 of the imported file |
| --- | --- | --- |
| `sections/sign-in-and-tenant-pages/sign-in-page.png` | 1280 x 900, light | `a615cc612589a3768dfaad85b105f33102f322496c00e7a25848f1337b5acbf3` |
| `sections/sign-in-and-tenant-pages/signin.png` | 1280 x 900, light | `a615cc612589a3768dfaad85b105f33102f322496c00e7a25848f1337b5acbf3` |
| `sections/sign-in-and-tenant-pages/sign-in-page-mobile.png` | 390 x 844, light | `1d37d0774ec540971e1be981509a1aa6f04e6c1c3a237a96b647b767aac4e17e` |
| `sections/sign-in-and-tenant-pages/signin-mobile.png` | 390 x 875, light | `6faa47ae68d4bab56ef5476333e41688db4752d6a47c63dc6a3b72f5f775f537` |
| `sections/sign-in-and-tenant-pages/sign-in-page-dark.png` | 1280 x 900, dark | `b1fe226c0d035e48c1e84d5280cdf3d46728c4a3d93b0c2af3ac0ae231e6d686` |
| `sections/sign-in-and-tenant-pages/sign-in-page-signed-out.png` | 1280 x 900, light | `00fed2eb4722a252bdd30209c5149c7fc1179e6c8c90e5f307e2a3b5a2609d8d` |
| `sections/sign-in-and-tenant-pages/sign-in-page-signed-out-mobile.png` | 390 x 844, light | `47dfa5af1d1098e6c544c30146d44aa0e6657be8bf2724451b09ca910c4cc015` |
| `sections/sign-in-and-tenant-pages/sign-in-page-session-expired.png` | 1280 x 900, light | `8a49a90803c7e12e5a6d9217b8c079d63e2c97b44619004ac993ac3588803c2b` |
| `sections/sign-in-and-tenant-pages/sign-in-page-session-expired-mobile.png` | 390 x 844, light | `469e4eee74a8d5b257dd88c242cae0e7936ec5f63947dfb9fca2191aac53ddef` |
| `sections/sign-in-and-tenant-pages/sign-in-page-not-registered.png` | 1280 x 900, light | `dcf0472f81bfb79230731444176dce868ebc9b9d8059989590e533813fc4f041` |
| `sections/sign-in-and-tenant-pages/sign-in-page-not-registered-mobile.png` | 390 x 844, light | `62465118b00646402f7b71f88c2b819cb93a9073f7502e13be0f45999e0f224d` |
| `sections/sign-in-and-tenant-pages/sign-in-page-account-disabled.png` | 1280 x 900, light | `6c03bb4aa6ce4a92d591837a8dc77f008218983fc3e7172f00238af6b87488f6` |
| `sections/sign-in-and-tenant-pages/sign-in-page-account-disabled-mobile.png` | 390 x 844, light | `765f0adadb3cc5728ec7fb34bc7735b3c49d58cffd1f27b354c9f66d80a73e48` |
| `sections/sign-in-and-tenant-pages/sign-in-page-local-accounts.png` | 1280 x 900, light | `2a89a4d0275abdb92bc75b876a394db415226fdabf7d63e986d5f662c4a2f549` |
| `sections/sign-in-and-tenant-pages/sign-in-page-local-accounts-mobile.png` | 390 x 844, light | `51e42a391bde694405fb2eaabca6b479f3849d81808132d45d6c5f2139e20b3a` |
| `sections/sign-in-and-tenant-pages/break-glass.png` | 1280 x 900, light | `18204a1eaa44d614d925ba8025e22547f44d4ad80052e7b6fff0b28c11fc66eb` |
| `sections/sign-in-and-tenant-pages/break-glass-sign-in.png` | 1280 x 900, light | `18204a1eaa44d614d925ba8025e22547f44d4ad80052e7b6fff0b28c11fc66eb` |
| `sections/sign-in-and-tenant-pages/break-glass-mobile.png` | 390 x 844, light | `4753c2a70d746b33a26e657bc2a076c41ebf02addfde221d6c41b0307075811e` |
| `sections/sign-in-and-tenant-pages/break-glass-sign-in-mobile.png` | 390 x 844, light | `4753c2a70d746b33a26e657bc2a076c41ebf02addfde221d6c41b0307075811e` |
| `sections/sign-in-and-tenant-pages/break-glass-sign-in-dark.png` | 1280 x 900, dark | `bc514b7fff031a81355fd5b3bf959eb51062c4de052ff266176557ef4a92bcb4` |
| `sections/sign-in-and-tenant-pages/break-glass-sign-in-error.png` | 1280 x 900, light | `2927552c29e58fb796861bafa807a974b471f26716e8d1d9880b491c6221a00d` |
| `sections/sign-in-and-tenant-pages/break-glass-sign-in-error-mobile.png` | 390 x 844, light | `5ef2476f9815fae3152710adcd7f17581557629a30c0d1ebfbfe3963596d1713` |
| `sections/sign-in-and-tenant-pages/break-glass-sign-in-rate-limited.png` | 1280 x 900, light | `f24732a046894deef52607457c2a5ab9dcfdda5a266d08f3c2b4faffe01d53b5` |
| `sections/sign-in-and-tenant-pages/break-glass-sign-in-code.png` | 1280 x 900, light | `e73d371e467caf6d4406902c4a358693607c66cf25b9f1c98fb35e87464c1ae7` |
| `sections/sign-in-and-tenant-pages/break-glass-sign-in-code-mobile.png` | 390 x 844, light | `fe80f5683daae2c17f3c723df5690c5acf1e7bf92cf47a7579a01aeb3b0b04da` |
| `sections/sign-in-and-tenant-pages/break-glass-sign-in-change-password.png` | 1280 x 900, light | `e91538274aa83621105d4821672cb2fa7ed2f97865a3fe284f65b5123e45930b` |
| `sections/sign-in-and-tenant-pages/break-glass-sign-in-change-password-mobile.png` | 390 x 844, light | `b87cde37a39841749fc5e11eee1628132d7f9f95eec3e90dba0e7cb0623550fd` |
| `sections/sign-in-and-tenant-pages/break-glass-sign-in-enroll.png` | 1280 x 900, light | `e3a89035dbffcdfb8b61aa6b15cf557d60ef37e38e554f1d141f1c3799b64681` |
| `sections/sign-in-and-tenant-pages/break-glass-sign-in-enroll-mobile.png` | 390 x 844, light | `5b0b4209492d44b359b6b9ac48ef75467bf483e9e357afc1b1431c81e8fc8497` |

## Limitations

- Pairs of old file names now hold the same capture: `signin.png` and `sign-in-page.png`, `break-glass.png` and `break-glass-sign-in.png`, and their phone files. The old files were also near copies. No file was removed, because other records name them.
- The Storybook captures show the state that each story's play function leaves: typed fields, and a focus ring on the last button that it pressed.
- The development build draws the TanStack Devtools button in the lower right corner of the dev app captures. It is not part of the product.
- The not-set-up captures did not change. They show no sign-in stack.
