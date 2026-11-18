/**
 * The x-axis label rule (`czjw.144`): the first and the last point always get a label, and the
 * labels between them step evenly from the first.
 */

const AXIS_LABEL_GAP = 5;

/** The chart's left and right margin, in px; a line or an area chart widens its right one. */
export const AXIS_MARGIN = 8;

/**
 * `band`: points in the middle of equal slots (a bar chart). `point`: points from the left edge of
 * the plot to its right edge (a line or an area chart, recharts 3.8 `combineRealScaleType`).
 */
export type AxisScale = "band" | "point";

/** The indexes to label: the first and the last, and an even step from the first between them. */
export function axisLabelIndexes(count: number, step: number): number[] {
  if (count <= 0) return [];

  const by = Math.max(1, Math.floor(step));
  const last = count - 1;
  const indexes: number[] = [];

  for (let index = 0; index < last; index += by) {
    // A label closer to the last one than a whole step would crowd it (czjw.144).
    if (index === 0 || last - index >= by) indexes.push(index);
  }

  return [...indexes, last];
}

type AxisFit = {
  readonly count: number;
  readonly plotWidth: number;
  readonly labelWidth: number;
  readonly scale: AxisScale;
};

/** The smallest whole step whose labels fit the plot, never above the last index. */
export function axisLabelStep(input: AxisFit): number {
  if (input.count < 2) return 1;

  return Math.min(neededStep(input), input.count - 1);
}

/**
 * Whether the first and the last label fit side by side. When they do not, only the first shows:
 * it is the label `axisLabelIndexes` keeps for a single point too.
 */
export function axisEndsFit(input: AxisFit): boolean {
  return neededStep(input) <= input.count - 1;
}

function neededStep({ count, plotWidth, labelWidth, scale }: AxisFit): number {
  if (count < 2) return 1;

  const slot = plotWidth / (scale === "band" ? count : count - 1);

  if (slot <= 0) return count;

  // A bar chart's last label moves left to stay inside the chart, so the step leaves room for it.
  const overhang =
    scale === "band" ? Math.max(0, labelWidth / 2 - slot / 2 - AXIS_MARGIN) : 0;

  return Math.ceil((labelWidth + AXIS_LABEL_GAP + overhang) / slot);
}

/** The room before a line or an area chart's first point: half the widest label, so it stays clear of the y axis. A bar chart's first label sits half a band in. */
export function firstPointInset(
  labelWidth: number | undefined,
  scale: AxisScale
): number {
  return scale === "point" && labelWidth !== undefined
    ? Math.ceil(labelWidth / 2)
    : 0;
}

/** A label's center, moved so the whole label stays between the y axis and the chart's right edge. */
export function labelCenter(input: {
  readonly x: number;
  readonly labelWidth: number;
  readonly plotLeft: number;
  readonly chartWidth: number;
}): number {
  const { x, labelWidth, plotLeft, chartWidth } = input;

  // A label wider than the room keeps its left edge on the y axis.
  return Math.max(
    plotLeft + labelWidth / 2,
    Math.min(x, chartWidth - labelWidth / 2)
  );
}
