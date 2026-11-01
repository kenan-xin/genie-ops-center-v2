import { describe, expect, it } from "vitest";

import { keepImageLinks } from "./image-links.ts";

const NOW = Date.parse("2026-10-27T09:00:00Z");

const link = (url: string, minutesLeft: number) => ({
  url,
  expiresAt: new Date(NOW + minutesLeft * 60_000).toISOString(),
});

describe("keepImageLinks", () => {
  it("keeps a link with time left, so a poll does not load the image again", () => {
    expect(
      keepImageLinks({ a: link("old", 3) }, { a: link("new", 5) }, NOW)
    ).toEqual({ a: link("old", 3) });
  });

  it("replaces a link that expires within a minute, and takes a new image's link", () => {
    expect(
      keepImageLinks(
        { a: link("old", 0.5) },
        { a: link("new", 5), b: link("added", 5) },
        NOW
      )
    ).toEqual({ a: link("new", 5), b: link("added", 5) });
  });
});
