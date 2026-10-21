# tools/generators

The Nx local plugin for this repository: the code and project generators, and the build-time module selection resolver.

## What belongs here

The `@genie/generators:module-new` and `@genie/generators:tenant-new` generators, and the resolver that turns a customer's module include list into build-time selection inputs. The classifier that maps a project root to its architectural tag lives here too.

## What must not go here

Application code, a module implementation, a database driver, a connection, or any code that reads a deployment environment value. This package runs during a build and a customer image, so it must stay free of runtime services.

## What it imports

The Node standard library, the shared presets from `@genie/config`, and the build-safe core schema entrypoints only. Never the core runtime entrypoint, never a module, never an app.
