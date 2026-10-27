import { describe, expect, it } from "vitest";

import { BASE_PORTS, IMAGE_PORT_BASE } from "./e2e-ports.ts";
import { PORT_OFFSET_SPAN, shiftedPort } from "./worktree-scope.ts";

const bases = Object.values(BASE_PORTS);

describe("the e2e base ports", () => {
  it("gives every stack its own base", () => {
    expect(new Set(bases).size).toBe(bases.length);
  });

  it("keeps the stacks of one worktree on distinct ports at every offset scopedPort can add", () => {
    const collisions: string[] = [];

    for (let offset = 0; offset < PORT_OFFSET_SPAN; offset += 1) {
      const ports = bases.map((base) => shiftedPort(base, offset));

      if (new Set(ports).size !== ports.length)
        collisions.push(`offset ${offset}`);
    }

    expect(collisions).toEqual([]);
  });

  it("keeps every stack port below the image band", () => {
    const highest = Math.max(
      ...bases.map((base) => shiftedPort(base, PORT_OFFSET_SPAN - 1))
    );

    expect(highest).toBeLessThan(IMAGE_PORT_BASE);
  });
});
