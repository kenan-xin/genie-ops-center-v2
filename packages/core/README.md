# packages/core

The shared platform capabilities that every module and app composes.

## What belongs here

Cross-cutting capabilities: identity and access, tenant context, settings, branding, entitlements, the file store, the event bus, and the data layer. A capability lives here once and every module consumes the same seam.

## What must not go here

A module implementation, an app composition, business logic specific to one capability module, and anything that violates the import direction. Core imports the user-interface package and never a module or an app.

## What it imports

`packages/ui` only among internal projects. Core sits above the user-interface package and below every module and app.
