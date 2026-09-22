# Developer diagnostics

This folder holds the development-only devtools mount and the values the Genie
Ops Center panel shows. It is reached from the root layout and from nowhere
else.

What belongs here: the mount and its development guard, the panel list, and the
functions that read diagnostic values off the application context. What does not
belong here: any behavior the application needs in order to serve a request, and
any presentational component. The panel itself is `DeploymentDiagnostics` in
`packages/ui`, so it has stories and component tests like every other component.

## The guard

`devtools-mount.tsx` chooses between the panels and a component that renders
nothing by reading `process.env.NODE_ENV`. The bundler replaces that expression
with a literal, so a production build keeps the empty branch and drops the
import on the other side. Nothing else keeps the devtools out of the image.

`apps/genie/testing/devtools-exclusion.test.ts` is the proof, and it is in the
mandatory manifest in `testing/required-tests-guard.ts`. It searches the built
output for string literals, not for exported names, because the minifier renames
names and an earlier version of that test passed while proving nothing. If you
add a probe, remove the guard, rebuild, and make sure that the probe fails
before you keep it.

## Truthfulness

The panel reports what the deployment really is and invents nothing. Section 0
authenticates nobody, so the panel says that in words rather than showing a
placeholder user, group or role.

No secret reaches the screen. `databaseName` returns the database name alone,
never the user, the password, the host or the port, and it checks the scheme
first, because `new URL` accepts an opaque string such as `user:password@nowhere`
and reports the password as its path. Add a value to this panel only after you
can say which part of it is safe to display.
