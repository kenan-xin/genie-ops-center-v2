# Font provenance

| File | Source package | SHA-256 |
| --- | --- | --- |
| `plus-jakarta-sans-latin-wght-normal.woff2` | `@fontsource-variable/plus-jakarta-sans@5.3.0` | `153fc85b70298beeb1d61a5f723331649e7f23bb77302a66e61cb3e2fbdb5e79` |
| `plus-jakarta-sans-latin-ext-wght-normal.woff2` | `@fontsource-variable/plus-jakarta-sans@5.3.0` | `38e3b8fd8045048eb311d90170a4429ed2c8f405852dc3d91b5af8452758703f` |
| `jetbrains-mono-latin-wght-normal.woff2` | `@fontsource-variable/jetbrains-mono@5.3.0` | `18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e` |
| `jetbrains-mono-latin-ext-wght-normal.woff2` | `@fontsource-variable/jetbrains-mono@5.3.0` | `79bfdab9ba467e26eea4122e6f2567e188dd8a09a8c730d501fc487c4ab99c6e` |

Both faces are licensed under the SIL Open Font License 1.1. Each package's `LICENSE`
is copied as `plus-jakarta-sans-OFL.txt` and `jetbrains-mono-OFL.txt`. The unicode
ranges in `fonts.css` are Fontsource's own, copied from each package's `index.css`.

Retrieved on 2026-10-23 with:

```sh
npm pack @fontsource-variable/plus-jakarta-sans@5.3.0
npm pack @fontsource-variable/jetbrains-mono@5.3.0
```

## Refresh

1. In a new empty folder, run the two `npm pack` commands with the new version.
2. Extract both tarballs. Run no script from them.
3. Copy the `-latin-wght-normal.woff2` and `-latin-ext-wght-normal.woff2` files from
   each `package/files/` into this folder, and each `package/LICENSE` as `<family>-OFL.txt`.
4. Compare the unicode ranges in each `package/index.css` with `fonts.css`.
5. Update the versions and the `sha256sum` values in this file.
