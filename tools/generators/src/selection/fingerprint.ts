import { createHash } from "node:crypto";

import type { ModuleSelection } from "./resolve.ts";

/**
 * The canonical serialized selection. This value, not the digest, is the source of
 * selection truth, so an unset selection and an explicit one never collapse together.
 */
export function serializeSelection(selection: ModuleSelection): string {
  return JSON.stringify({ source: selection.source, ids: selection.ids });
}

/** A stable digest of the canonical value, for use as a declared cache input. */
export function fingerprintSelection(selection: ModuleSelection): string {
  return createHash("sha256").update(serializeSelection(selection), "utf8").digest("hex");
}
