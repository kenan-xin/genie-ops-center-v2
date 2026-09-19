# src/storybook

The reserved extension point of the shared Storybook configuration. It holds a typed placeholder that names S0-02 as the owner of its content.

## What belongs here

Only the reserved shape. S0-02 fills the story globs from the module selection resolver, chooses the framework, lists the addons, and writes the preset body. The placeholder stays build-safe: importing it starts no service and reads no environment value.

## What must not go here

No Storybook dependency, no Storybook import, no framework choice, and no Nx target before S0-02. Every Storybook pin belongs to S0-02.
