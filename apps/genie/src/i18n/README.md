# Request configuration and the catalogue check

This folder holds the next-intl request configuration for this application, and
the check that keeps the English catalogue and the application sources in
agreement. The catalogue itself is one file, `../messages/en.json`.

What belongs here: the request configuration, the catalogue check and its
tests, and this document. What does not belong here: message text, which lives
in the catalogue file, a translated catalogue, which Section 0 excludes
(`DEC-13`), and any component or page.

## Add a string

1. Add the message to `../messages/en.json`, under the namespace the page uses.
2. Read it with `const t = await getTranslations("<namespace>")` and a literal
   key, for example `t("title")`.
3. Run `pnpm test` in `apps/genie`.

A key you add and never read fails the check, and a key you read and never add
fails it. Both directions compare fully qualified leaf keys, such as
`app.title`, so each difference names one exact string.

## A missing key at run time

Run-time behavior is next-intl's default and this ticket does not change it. A
missing message prints an `IntlError` on the console and renders
`namespace.key` in place of the text, so the page keeps serving. A custom
`onError` that throws is deliberately absent, because one absent string must not
take a production page down, and because `NextIntlClientProvider` does not
inherit `onError` from the request configuration. The failing check is the test,
which runs before the string reaches a deployment.

## What the check reads

The check parses each application source with the TypeScript compiler API and
follows the import binding, not the identifier name. A local helper called `t`
contributes no key, and an aliased import such as
`import { getTranslations as load }` resolves correctly.

It reads the shapes that exist in `apps/genie/src` today: a named import of
`getTranslations` or `useTranslations` from `next-intl` or `next-intl/server`,
assigned to one name, called with one string literal. Every other shape is a
reported violation, including a computed namespace or key, a namespace import, a
translator passed as a value, and a next-intl import the inventory does not
name. To use a shape the check refuses, add it to the inventory in
`catalogue-coverage.ts` and to the tests beside it, in the same change.

The check reads application sources only. Tests, stories and fixtures are
excluded, so a string that exists only in a test can never satisfy a catalogue
entry.

The check imports `typescript`, which this repository declares once at the root
and every package already uses for `tsc`. `apps/genie/package.json` does not
declare it, because this ticket does not own package manifests. Adding that
development dependency is open work for the owner of the shared manifest window.
