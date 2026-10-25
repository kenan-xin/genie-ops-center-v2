# packages/core/src/services/file-storage

The platform's own file store (R-6, R-32–R-39, DEC-20). The tenant context builds one and exposes
it as the fixed member `context.fileStorage`; nothing else builds or holds one (DEC-34).

## What belongs here

- `store`, `fetch`, `remove`, `createLink`, `createBrandingMarkLink` and `fetchLink`, and the upload rules that run before a byte is
  stored: the `FILE_MAX_BYTES` limit, the type allow-list, and the SVG sanitizer (R-35–R-37).
- The token that a download link carries, signed over its scope and the expiry (R-38).
- `adapters/`, one byte store per `FILE_STORAGE_ADAPTER`. This section ships the `postgres` adapter
  only; `s3`, `gcs` and `azure` arrive with their adapter.
- `blob-store.ts`, the `FileBlobStore` seam every adapter implements.

The allow-list holds both ico types, `image/x-icon` and `image/vnd.microsoft.icon`, for branding
favicons. The branding upload seam in `services/branding/` narrows the list to its four image types
and its own 1 MB cap before it calls `store`.

## What must not go here

- A reading or writing of `file_blob` outside `adapters/`. That table is the adapter's alone, so a
  future `genie-ops files migrate` can copy blobs between stores (R-34).
- A second database connection, a global store, or a `can()` bypass: every record link step goes
  through the one authorization seam (DEC-39, R-38). The branding scope below is the one exception,
  and it reaches no file but the mark the branding row names.

## The SVG sanitizer

Every uploaded `image/svg+xml` passes DOMPurify's SVG profile, with the default URI handling kept
so drawing attributes (`viewBox`, `d`, `fill="url(#g)"`) survive. The same-document rule is one
`uponSanitizeAttribute` hook: a `href`/`xlink:href` that is not a `#` reference is dropped, and so
is any attribute holding a `url(...)` that does not point at a `#` reference. A value holding a
backslash is dropped too, because CSS decodes `u\72l(` to `url(`. Code points XML 1.0 forbids (the
C0 controls except tab, line feed and carriage return, and the non-characters U+FFFE/U+FFFF) are
removed before sanitizing. The result is serialized as XML, not HTML, so U+00A0 and other
HTML-only spellings reparse as `image/svg+xml`.

DOMPurify removes `<use>` entirely, including `<use href="#c">`, so a sprite-based icon that relies
on `<use>` loses its shapes. A logo that inlines its paths is unaffected.

## The link-token secret

A download token is an HMAC-SHA256 over a JSON payload, keyed by a random secret the context
generates once when it is built. The payload is discriminated on `kind`, and a payload without one
is refused:

- `record`: `{ fileId, permission, resourceType, resourceId, expiresAt }`. `fetchLink` reads the
  permission and resource from the verified token and runs `can()`, so a caller cannot widen the
  link after it is issued.
- `branding`: `{ fileId, expiresAt }`. Only `createBrandingMarkLink` signs one, for the file that
  `tenant_branding.logo_mark_file_id` names, read through the branding reader, while that file is
  `clean` or `skipped`. It takes no file id. `fetchLink` serves it to any authenticated principal,
  because a person with no grants holds no permission key to check, yet must see the shell's mark
  (Spec 3 R-39, D3-7).

The app serves both kinds at `/api/files/download?token=...`, which answers an empty 404 for every
refusal.

Section 1's environment contract has no file-link secret, and R-27 keeps
`BETTER_AUTH_SECRET` out of this section, so a random per-context key is the one choice that needs
no new variable and stores no credential. A token lives five minutes, so losing outstanding links
on a restart is acceptable. A later section that runs more than one application replica replaces
this key with one shared secret from the environment.
