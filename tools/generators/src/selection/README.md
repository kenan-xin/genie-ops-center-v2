# tools/generators/src/selection

The one build-time module selection resolver. The application registry generation and the Storybook host both read it.

## What belongs here

Reading the data-only module inventory, resolving an ordered selection from `MODULE_INCLUDE` or a customer `modules.txt`, and producing the canonical serialized selection and its fingerprint. Pruning an image build's `packages/modules/` folders to that selection, which the Dockerfile builder stage runs before install.

## What must not go here

Any import of a module declaration, the application runtime, a database driver, or executable configuration. An entrypoint path is validated data used to emit import text. It is never a path this code loads. Registry generation itself belongs to the application and arrives in S0-05.

## What it imports

The Node standard library only.
