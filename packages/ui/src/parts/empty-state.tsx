import { cn } from "cn";
import type { ReactNode } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "../components/empty.tsx";

export type EmptyStateProps = {
  /** `h1` when the state is the whole page, as a refused page is. */
  readonly headingLevel?: "h1" | "h2";
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
} & (
  | {
      /** No frame and no tile: a list that matches nothing. */
      readonly variant?: "compact";
    }
  | {
      /** A dashed frame, a tile and a larger heading: a refused page or an empty home. */
      readonly variant: "framed";
      /** Drawn in the neutral tile. */
      readonly icon?: ReactNode;
      /** Shown as given, without the icon tile: a logo tile or an image. */
      readonly media?: ReactNode;
    }
);

/** Nothing to show (tokens.md, "Empty state"), in one of two forms. */
export function EmptyState(props: EmptyStateProps) {
  const Heading = props.headingLevel ?? "h2";
  const framed = props.variant === "framed";

  return (
    <Empty variant={framed ? "framed" : "default"}>
      <EmptyHeader>
        {framed && props.icon ? (
          <EmptyMedia variant="tile">{props.icon}</EmptyMedia>
        ) : null}
        {framed && props.media ? <EmptyMedia>{props.media}</EmptyMedia> : null}
        <Heading
          data-slot="empty-title"
          className={cn(
            "tracking-tight text-balance",
            // The framed heading is the page title (tokens.md, type scale).
            framed ? "text-xl font-bold" : "text-sm font-semibold"
          )}
        >
          {props.title}
        </Heading>
        <EmptyDescription>{props.description}</EmptyDescription>
      </EmptyHeader>
      {props.action ? <EmptyContent>{props.action}</EmptyContent> : null}
    </Empty>
  );
}
