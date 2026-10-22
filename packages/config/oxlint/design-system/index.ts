import { definePlugin } from "@oxlint/plugins";

import { singleOwnerRule } from "./rules/single-owner.ts";

/**
 * The rules that keep a design-system part with its one owner. Written for this
 * repository, with no vendored code.
 */
const designSystemPlugin = definePlugin({
  meta: { name: "design-system" },
  rules: {
    "single-owner": singleOwnerRule,
  },
});

export default designSystemPlugin;
