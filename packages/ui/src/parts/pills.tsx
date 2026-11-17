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

/**
 * A count. With a `tone`, a count of a status tab (R-37a): `neutral` grey, `danger` red (Overdue),
 * `warning` amber (No due date, Not linked). Tabular figures, so a row of counts lines up
 * (6wz1.125).
 */
export function CountPill(props: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "danger" | "warning";
}) {
  return (
    <Badge
      // oxlint-disable-next-line shadcn/no-restyle -- a count sets tabular figures, so its pill keeps its width (6wz1.125, A-7)
      className="tabular-nums"
      variant={
        props.tone === undefined
          ? "count"
          : props.tone === "neutral"
            ? "label"
            : props.tone
      }
    >
      {props.children}
    </Badge>
  );
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
