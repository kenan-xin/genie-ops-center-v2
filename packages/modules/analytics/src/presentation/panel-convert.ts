import type { ChartType, PanelConfig } from "@genie/core";

const CARTESIAN = ["bar", "line", "area"] as const;

/** The types a panel can become without new input (D4). The current type is not offered. */
export function convertibleTypes(panel: PanelConfig): readonly ChartType[] {
  switch (panel.type) {
    case "bar":
    case "line":
    case "area": {
      const others = CARTESIAN.filter((type) => type !== panel.type);

      return panel.series.length === 1 ? [...others, "donut", "table"] : others;
    }

    case "donut":
      return ["bar", "line", "area", "table"];

    case "kpi":
      return ["table"];

    case "table":
      return [];
  }
}

/** The panel in the asked type: every series kept, and no field the new type lacks. */
export function convertPanel(panel: PanelConfig, type: ChartType): PanelConfig {
  if (!convertibleTypes(panel).includes(type)) {
    throw new Error(`A ${panel.type} panel cannot become a ${type} panel.`);
  }

  const title = panel.title;

  switch (panel.type) {
    case "bar":
    case "line":
    case "area": {
      if (type === "bar" || type === "line" || type === "area") {
        return { type, title, series: panel.series };
      }

      const [first] = panel.series;

      if (first === undefined) {
        throw new Error("A chart panel has at least one series.");
      }

      const { name, dataset, query } = first;

      if (type === "donut") {
        return {
          type,
          title,
          series: [{ name, dataset, query, category: first.x, value: first.y }],
        };
      }

      if (type === "table") {
        return { type, title, series: [{ name, dataset, query }] };
      }

      throw new Error(`A chart panel cannot become a ${type} panel.`);
    }

    case "donut": {
      const [first] = panel.series;
      const { name, dataset, query } = first;

      if (type === "table") {
        return { type, title, series: [{ name, dataset, query }] };
      }

      if (type === "bar" || type === "line" || type === "area") {
        return {
          type,
          title,
          series: [{ name, dataset, query, x: first.category, y: first.value }],
        };
      }

      throw new Error(`A donut panel cannot become a ${type} panel.`);
    }

    case "kpi": {
      const [first] = panel.series;
      const { name, dataset, query } = first;

      return { type: "table", title, series: [{ name, dataset, query }] };
    }

    case "table":
      throw new Error("A table panel cannot change its type.");
  }
}
