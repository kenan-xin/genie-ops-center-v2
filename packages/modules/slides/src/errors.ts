import { defineModuleErrors } from "@genie/core";

/**
 * The module's refusals, each `slides:<code>` with its fixed safe message. A request that cannot
 * be valid answers 400; one that clashes with the stored deck answers 409.
 */
export const SLIDES_ERRORS = defineModuleErrors("slides", {
  "deck-changed": {
    message:
      "This deck changed since you opened it. Reload it to see the latest version.",
    status: 409,
  },
  "nothing-to-undo": {
    message: "This deck has no change to undo.",
    status: 409,
  },
  "change-invalid": {
    message: "That change does not fit this deck.",
    status: 400,
  },
  "refresh-first": {
    message:
      "The figures of this deck are from an earlier reporting date. Refresh data first, then add or change a figure, chart or table.",
    status: 409,
  },
  "image-invalid": {
    message: "Upload a PNG or JPEG image.",
    status: 400,
  },
  "image-too-large": {
    message:
      "That image is over the upload limit of this deployment. Upload a smaller image.",
    status: 413,
  },
});
