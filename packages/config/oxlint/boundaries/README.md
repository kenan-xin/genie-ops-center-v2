# packages/config/oxlint/boundaries

The import-direction rules that a specifier glob cannot express, written as an Oxlint plugin for this repository.

## What belongs here

A rule that must resolve an import specifier against the importing file, because the specifier string alone does not carry the answer. Today that is one rule: a relative import that leaves the importing module's own folder.

## What must not go here

A rule a glob can state. Those stay in `packages/config/src/oxlint/boundaries.ts`, which is the readable table of the import direction. A rule that needs type information, because this plugin sees syntax and file paths only. Vendored code: the anti-slop plugin beside this folder carries its own licence and provenance, and this folder carries neither, because every line here is written for this repository.

## What it imports

`@oxlint/plugins` and `node:path`. Nothing else.
