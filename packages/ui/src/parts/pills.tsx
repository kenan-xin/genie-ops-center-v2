import type { ReactNode } from "react";

import { Badge } from "../components/badge.tsx";
import { categoryChipClasses, type CategoryTone } from "../theme/tokens.ts";

export function StatusPill(props: {
  readonly tone: "success" | "neutral" | "danger" | "warning";
  readonly children: ReactNode;
}) {
  return <Badge variant={props.tone}>{props.children}</Badge>;
}

export function LabelPill(props: { readonly children: ReactNode }) {
  return <Badge variant="label">{props.children}</Badge>;
}

export function MonoChip(props: { readonly children: ReactNode }) {
  return <Badge variant="mono">{props.children}</Badge>;
}

export function CountPill(props: { readonly children: ReactNode }) {
  return <Badge variant="count">{props.children}</Badge>;
}

/**
 * The action chip of a table or card-list row (`DESIGN.md`, State-vs-Label Rule exception). It
 * keeps its text label, so the category color is never the only code. A row with no category,
 * such as an operator row, keeps the neutral fill.
 */
export function CategoryChip(props: {
  readonly category: CategoryTone | null;
  readonly wrap?: boolean | undefined;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-medium ${
        props.wrap ? "whitespace-normal break-all" : "whitespace-nowrap"
      } ${
        props.category === null
          ? "bg-muted text-foreground"
          : categoryChipClasses[props.category]
      }`}
    >
      {props.children}
    </span>
  );
}
