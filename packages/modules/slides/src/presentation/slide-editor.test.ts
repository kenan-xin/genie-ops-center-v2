import { describe, expect, it } from "vitest";

import { frozenElement } from "../../testing/factories.ts";
import { slideInputOf } from "./slide-editor.tsx";

describe("the hand edit of a styled slide", () => {
  it("sends back every box, style and the background, so a text edit keeps them", () => {
    const figure = frozenElement("figure");
    const box = { x: 384, y: 136, w: 536, h: 348 };

    const input = slideInputOf({
      id: "s1",
      background: "#1E3A8A",
      elements: [
        { kind: "title", text: "Claim", style: { color: "#FFFFFF" } },
        { ...figure, box, style: { fill: "#EFF6FF" } },
      ],
    });

    expect(input).toEqual({
      background: "#1E3A8A",
      elements: [
        { kind: "title", text: "Claim", style: { color: "#FFFFFF" } },
        {
          kind: "figure",
          chart: "chart" in figure ? figure.chart : undefined,
          box,
          style: { fill: "#EFF6FF" },
        },
      ],
    });
  });
});
