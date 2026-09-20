import { definePlugin } from "@oxlint/plugins";

import { noRelativePackageEscapeRule } from "./rules/no-relative-package-escape.ts";

/**
 * The import-direction rules that a specifier glob cannot express. Everything a
 * glob can state stays in `packages/config/src/oxlint/boundaries.ts`; a rule
 * arrives here only when it must resolve a specifier against the importing
 * file. This plugin is written for this repository and carries no vendored
 * code, unlike the anti-slop plugin beside it.
 */
const boundariesPlugin = definePlugin({
  meta: { name: "boundaries" },
  rules: {
    "no-relative-package-escape": noRelativePackageEscapeRule,
  },
});

export default boundariesPlugin;
