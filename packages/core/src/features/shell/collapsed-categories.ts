import { z } from "zod";

/** The device's collapsed categories (R-31): per browser, not per account. */
export const COLLAPSED_CATEGORIES_KEY = "genie.sidebar.collapsed";

const storedIds = z.array(z.string());

/** The collapsed category ids, or none when storage is missing, throws, or holds junk. */
export function readCollapsed(
  storage: Pick<Storage, "getItem"> | undefined
): ReadonlySet<string> {
  try {
    const value: unknown = JSON.parse(
      storage?.getItem(COLLAPSED_CATEGORIES_KEY) ?? "[]"
    );

    const parsed = storedIds.safeParse(value);

    return new Set(parsed.success ? parsed.data : []);
  } catch {
    return new Set();
  }
}

/** Stores the collapsed ids. A refusal (private mode, full quota) keeps the state for this visit. */
export function writeCollapsed(
  storage: Pick<Storage, "setItem"> | undefined,
  ids: ReadonlySet<string>
): void {
  try {
    storage?.setItem(COLLAPSED_CATEGORIES_KEY, JSON.stringify([...ids]));
  } catch {
    // The in-memory state still toggles; only persistence is lost.
  }
}
