# components

The shadcn primitives on Base UI (`@base-ui/react`). The shadcn command line writes each file here from the style in `../../components.json`, for example `npx shadcn@4.22.1 add button --cwd packages/ui`. After the command, a generated file changes only for one of these reasons:

- to replace a class that the token layer does not own,
- to rename a variant or a size to its name in `docs/design/design-system/tokens.md`,
- to add a state or an accessibility rule that tokens.md or Spec 3 names.

Composed parts go in `../parts/`.

Do not put composed components, business screens or hand-written primitives here.
