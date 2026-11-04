"use client";

import { ChartColumnIcon, type LucideIcon, TableIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { ArtifactKind } from "../../services/agent/index.ts";
import { GatedChart } from "./gated-chart.tsx";

/**
 * Core's artifact kind registry (AG6, `DEC-56`): the view of each kind the artifact panel draws.
 * Chart and table are a panel config drawn through the chart gate as the viewer. Document and
 * record list get their view with their maker (P2-6). A future `artifact-kinds` contract point
 * adds a module's kind here.
 */
export type ArtifactKindView = {
  readonly label: string;
  readonly icon: LucideIcon;
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a stored definition; each kind's view is its parser
  readonly render: (definition: unknown) => ReactNode;
};

export const ARTIFACT_VIEWS: Readonly<
  Partial<Record<ArtifactKind, ArtifactKindView>>
> = {
  chart: {
    label: "Chart",
    icon: ChartColumnIcon,
    render: (definition) => <GatedChart config={definition} caption="source" />,
  },
  table: {
    label: "Table",
    icon: TableIcon,
    render: (definition) => <GatedChart config={definition} caption="source" />,
  },
};
