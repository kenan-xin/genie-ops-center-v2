# packages/core/src/services/mailer

The mailer of R-43: one interface with a hosted-provider (Resend) adapter and an SMTP
(Nodemailer) adapter, plus the R-48 template catalogue.

## What belongs here

The `mailer` member of the tenant context, built once from the validated environment (D-7), with
`requireConfigured()` as the fail-before-write gate of R-45 and `send()` over one catalogue
template. The templates of R-48 render an HTML part and a plain-text part that are written
separately, so neither adapter derives one part from the other (R-44). Every line this service
logs goes through the redacting logger, so a tokenized link never reaches a log (R-49).

## What must not go here

The events that send these templates (Section 2 item 8 and the first notifying module), the
Keycloak credential emails of DEC-40, and any second copy of the sender name: it is read from the
branding reader at send time.

## Link rule for Section 2 senders

The redacting logger replaces a token in a query parameter (`token`, `code`, `key`, `signature`
and similar) and a token in the URL userinfo, but it does not replace a token in a path segment.
So every tokenized link a Section 2 sender builds must carry its token in a query parameter (or
in userinfo), never in the path. R-49 holds only while that rule holds. The one exception is the
development-only log line, which shows the full working link on purpose (R-45).
