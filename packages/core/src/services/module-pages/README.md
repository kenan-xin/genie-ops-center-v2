# packages/core/src/services/module-pages

The module page service: how core turns a module's `pages` declarations into routes (Spec 7 R-1).

## What belongs here

Matching a request path to the one module page that answers it, for a route folder and for the
proxy's route owner; the page check, which is a `can()` call on the page's permission (on the
record when the page declares one) before anything loads; and the call of the page's loader and
component after the check passes.

## What must not go here

A module id or a module import: the service reads only the declarations it is handed. A `next/*`
import: the app's route files turn the answer into a 404 or a denied page. A permission rule
beside `can()`: the `<id>:` prefix guard only decides that a declaration is not a page, and never
grants.
