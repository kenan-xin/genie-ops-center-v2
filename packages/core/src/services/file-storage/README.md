# packages/core/src/services/file-storage

The platform's own file store (R-6, R-32–R-39, DEC-20). The tenant context builds one and exposes
it as the fixed member `context.fileStorage`; nothing else builds or holds one (DEC-34).

## What belongs here

- `store`, `fetch`, `createLink` and `fetchLink`, and the upload rules that run before a byte is
  stored: the `FILE_MAX_BYTES` limit, the type allow-list, and the SVG sanitizer (R-35–R-37).
- The token that a download link carries, signed over the file id and its expiry (R-38).
- `adapters/`, one byte store per `FILE_STORAGE_ADAPTER`. This section ships the `postgres` adapter
  only; `s3`, `gcs` and `azure` arrive with their adapter.
- `blob-store.ts`, the `FileBlobStore` seam every adapter implements.

## What must not go here

- A reading or writing of `file_blob` outside `adapters/`. That table is the adapter's alone, so a
  future `genie-ops files migrate` can copy blobs between stores (R-34).
- A second database connection, a global store, or a `can()` bypass: every link step goes through
  the one authorization seam (DEC-39, R-38).

## The link-token secret

A download token is an HMAC-SHA256 over `<fileId>:<expiresAt>`, keyed by a random secret the
context generates once when it is built. Section 1's environment contract has no file-link secret,
and R-27 keeps `BETTER_AUTH_SECRET` out of this section, so a random per-context key is the one
choice that needs no new variable and stores no credential. A token lives five minutes, so losing
outstanding links on a restart is acceptable. A later section that runs more than one application
replica replaces this key with one shared secret from the environment.
