import { defineModuleErrors } from "@genie/core";

/**
 * The module's refusals, each `analytics:<code>` with its fixed safe message. A request that cannot
 * be valid answers 400; one that clashes with the stored dashboard answers 409.
 */
export const ANALYTICS_ERRORS = defineModuleErrors("analytics", {
  "dashboard-changed": {
    message:
      "This dashboard changed since you opened it. Reload it to see the latest version.",
    status: 409,
  },
  "dashboard-name-taken": {
    message:
      "You already have a dashboard with that name. Choose another name.",
    status: 409,
  },
  "nothing-to-undo": {
    message: "This dashboard has no change to undo.",
    status: 409,
  },
  "change-invalid": {
    message: "That change does not fit this dashboard.",
    status: 400,
  },
  "panel-limit": {
    message: "A dashboard holds at most 12 panels. Remove a panel first.",
    status: 409,
  },
  "view-limit": {
    message: "A dashboard keeps at most 20 views. Remove one to save another.",
    status: 400,
  },
});
