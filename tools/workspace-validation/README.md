# tools/workspace-validation

The repository-wide workspace checks, run as the Nx `validate` target.

## What belongs here

The checks that read across the whole workspace rather than one package: the
affected-graph assertions, the CI workflow wiring, the clean-checkout registry
generation, the generator entrypoint resolution, the repository hygiene rules,
the lint scope and the `validate` target's own input list.

## What must not go here

Anything a build, a customer image or a running application reads. These checks
run only under the `validate` target and never ship.

## What it imports

The Node standard library, the workspace-policy helpers from `@genie/generators`
(the classifier, the module naming and test rules, and the README rule), and
`vitest`. Nothing else, and nothing imports this project: it is a leaf, so a
change to a document it reads can never mark an app or the Storybook host
affected.
