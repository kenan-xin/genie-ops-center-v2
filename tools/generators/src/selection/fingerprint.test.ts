import { describe, expect, it } from "vitest";

import { fingerprintSelection, serializeSelection } from "./fingerprint.ts";
import type { ModuleSelection } from "./resolve.ts";

function selection(source: ModuleSelection["source"], ids: readonly string[]): ModuleSelection {
  return { source, ids, entries: [] };
}

describe("selection serialization and fingerprint", () => {
  it("produces the same value for the same input", () => {
    const a = serializeSelection(selection("explicit", ["alpha", "beta"]));
    const b = serializeSelection(selection("explicit", ["alpha", "beta"]));

    expect(a).toBe(b);
    expect(fingerprintSelection(selection("explicit", ["alpha", "beta"]))).toBe(
      fingerprintSelection(selection("explicit", ["alpha", "beta"])),
    );
  });

  it("keeps unset and explicit apart even when the effective list matches", () => {
    const unset = selection("unset", ["alpha", "beta"]);
    const explicit = selection("explicit", ["alpha", "beta"]);

    expect(serializeSelection(unset)).not.toBe(serializeSelection(explicit));
    expect(fingerprintSelection(unset)).not.toBe(fingerprintSelection(explicit));
  });

  it("changes when the order changes, because order decides the registry order", () => {
    expect(fingerprintSelection(selection("explicit", ["alpha", "beta"]))).not.toBe(
      fingerprintSelection(selection("explicit", ["beta", "alpha"])),
    );
  });

  it("changes between explicitly empty and one module", () => {
    expect(fingerprintSelection(selection("explicit", []))).not.toBe(
      fingerprintSelection(selection("explicit", ["alpha"])),
    );
  });

  it("produces a hexadecimal digest of a fixed length", () => {
    expect(fingerprintSelection(selection("explicit", ["alpha"]))).toMatch(/^[0-9a-f]{64}$/);
  });
});
