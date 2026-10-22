import type { ReactNode } from "react";

import { Badge } from "../components/badge.tsx";

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
