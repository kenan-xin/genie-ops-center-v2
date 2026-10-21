import { describe, expect, it } from "vitest";

import { networksToSweep } from "./standin-network.ts";

const OWN = "genie-identity-standins-89c866b168c6";

describe("networksToSweep", () => {
  it("removes this worktree's network when no container uses it", () => {
    expect(networksToSweep([{ name: OWN, containerCount: 0 }], OWN)).toEqual([
      OWN,
    ]);
  });

  it("keeps this worktree's network while a container, even a stopped one, uses it", () => {
    expect(networksToSweep([{ name: OWN, containerCount: 1 }], OWN)).toEqual(
      []
    );
  });

  it("never removes another worktree's network or a name that only shares the prefix", () => {
    const others = [
      // Another worktree's gate may be running right now.
      "genie-identity-standins-0e79ef2a486e",
      // Docker's name filter matches part of a name, so a longer id is listed too.
      `${OWN}0`,
      // The unscoped default name and unrelated networks.
      "genie-identity-standins",
      "bridge",
      `x-${OWN}`,
    ].map((name) => ({ name, containerCount: 0 }));

    expect(networksToSweep(others, OWN)).toEqual([]);
  });
});
