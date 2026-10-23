import { implementCoreArea } from "../../lib/rpc/implement-core-area.ts";
import { settingsContract } from "./contract.ts";

/** The Settings page router, empty until S3-06 adds its procedures. */
export function createSettingsRouter() {
  return implementCoreArea(settingsContract).router({});
}

export type SettingsRouter = ReturnType<typeof createSettingsRouter>;
