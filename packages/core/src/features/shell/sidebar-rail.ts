import { z } from "zod";

/** The device's choice of the icon rail for the main menu: per browser, as R-31 keeps categories. */
export const SIDEBAR_RAIL_KEY = "genie.sidebar.rail";

const storedRail = z.boolean();

/** The device's rail choice; false when storage is missing, throws, or holds junk. */
export function readRail(
  storage: Pick<Storage, "getItem"> | undefined
): boolean {
  try {
    const value: unknown = JSON.parse(
      storage?.getItem(SIDEBAR_RAIL_KEY) ?? "false"
    );

    const parsed = storedRail.safeParse(value);

    return parsed.success && parsed.data;
  } catch {
    return false;
  }
}

/** Stores the choice. A refusal (private mode, full quota) keeps the state for this visit. */
export function writeRail(
  storage: Pick<Storage, "setItem"> | undefined,
  rail: boolean
): void {
  try {
    storage?.setItem(SIDEBAR_RAIL_KEY, JSON.stringify(rail));
  } catch {
    // The in-memory state still toggles; only persistence is lost.
  }
}
