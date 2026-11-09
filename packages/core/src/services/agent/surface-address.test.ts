import { describe, expect, it } from "vitest";

import {
  recordAddress,
  type SurfaceView,
  surfaceRecordOf,
} from "./surface-address.ts";

const slides: SurfaceView = {
  id: "slides",
  name: "Slides agent",
  recordPage: "/m/slides/decks/:id",
  acceptsHandoff: true,
};

const surfaces = [slides];

describe("surfaceRecordOf", () => {
  it("finds the surface and record of its own record address only", () => {
    expect(
      surfaceRecordOf(surfaces, recordAddress(slides.recordPage, "a1"))
    ).toEqual({ surface: slides, recordId: "a1" });
    expect(surfaceRecordOf(surfaces, "/m/slides/decks")).toBeUndefined();
    expect(
      surfaceRecordOf(surfaces, "/m/slides/decks/a1/edit")
    ).toBeUndefined();
    expect(
      surfaceRecordOf(surfaces, recordAddress(slides.recordPage, "a b/c"))
    ).toEqual({ surface: slides, recordId: "a b/c" });
  });
});
