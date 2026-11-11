import { describe, expect, it } from "vitest";

import { axisLabelIndexes, axisLabelStep } from "./chart-axis.ts";

describe("axisLabelIndexes", () => {
  it.each([
    [6, 1, [0, 1, 2, 3, 4, 5]],
    [6, 2, [0, 2, 5]],
    // 12 points at step 2 drop index 10, one point from the last ...
    [12, 2, [0, 2, 4, 6, 8, 11]],
    [12, 3, [0, 3, 6, 11]],
    // ... and 13 points at step 2 keep it, a whole step from the last.
    [13, 2, [0, 2, 4, 6, 8, 10, 12]],
    [13, 3, [0, 3, 6, 9, 12]],
    [13, 4, [0, 4, 8, 12]],
  ] as const)(
    "labels %i points at step %i from the first to the last",
    (count, step, expected) =>
      expect(axisLabelIndexes(count, step)).toEqual(expected)
  );

  it.each([
    [0, 1, []],
    [1, 3, [0]],
    [2, 5, [0, 1]],
    [5, 9, [0, 4]],
    [3, 0, [0, 1, 2]],
  ] as const)(
    "keeps one label per point for %i points at step %i",
    (count, step, expected) =>
      expect(axisLabelIndexes(count, step)).toEqual(expected)
  );
});

describe("axisLabelStep", () => {
  it.each([
    ["band", 250, 6, [0, 2, 5]],
    ["band", 250, 12, [0, 3, 6, 11]],
    ["band", 250, 13, [0, 3, 6, 9, 12]],
    ["band", 380, 6, [0, 1, 2, 3, 4, 5]],
    ["band", 380, 12, [0, 2, 4, 6, 8, 11]],
    ["band", 380, 13, [0, 2, 4, 6, 8, 10, 12]],
    ["band", 1000, 6, [0, 1, 2, 3, 4, 5]],
    ["band", 1000, 12, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
    ["band", 1000, 13, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
    ["point", 260, 6, [0, 1, 2, 3, 4, 5]],
    ["point", 260, 12, [0, 2, 4, 6, 8, 11]],
    ["point", 260, 13, [0, 3, 6, 9, 12]],
  ] as const)(
    "fits a %s scale of %i px to %i points",
    (scale, plotWidth, count, expected) =>
      expect(
        axisLabelIndexes(
          count,
          axisLabelStep({ count, plotWidth, labelWidth: 40, scale })
        )
      ).toEqual(expected)
  );

  it.each([
    [{ count: 6, plotWidth: 270, labelWidth: 40, scale: "band" }, 1],
    [{ count: 6, plotWidth: 269, labelWidth: 40, scale: "band" }, 2],
    [{ count: 12, plotWidth: 495, labelWidth: 40, scale: "point" }, 1],
    [{ count: 12, plotWidth: 494, labelWidth: 40, scale: "point" }, 2],
  ] as const)(
    "takes the step exactly at the fit, and the next one a pixel under it: %j",
    (input, expected) => expect(axisLabelStep(input)).toBe(expected)
  );

  it("leaves room for a bar chart's last label, which moves left to stay inside", () =>
    expect(
      axisLabelStep({
        count: 12,
        plotWidth: 270,
        labelWidth: 40,
        scale: "band",
      })
    ).toBe(3));

  it("stops at the first and the last label", () => {
    const phone: Parameters<typeof axisLabelStep>[0] = {
      count: 6,
      plotWidth: 250,
      labelWidth: 120,
      scale: "band",
    };

    expect(axisLabelStep(phone)).toBe(4);
    expect(axisLabelIndexes(6, 4)).toEqual([0, 5]);
    // A step never goes past the last point.
    expect(axisLabelStep({ ...phone, labelWidth: 300 })).toBe(5);
    // A plot with no width gives the widest step, never a division by zero.
    expect(
      axisLabelStep({ count: 12, plotWidth: 0, labelWidth: 40, scale: "band" })
    ).toBe(11);
    expect(
      axisLabelStep({ count: 1, plotWidth: 250, labelWidth: 40, scale: "band" })
    ).toBe(1);
  });
});
