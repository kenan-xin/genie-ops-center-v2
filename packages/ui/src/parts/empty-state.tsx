import type { ReactNode } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/empty.tsx";

export function EmptyState(props: {
  readonly icon?: ReactNode;
  /** Shown as given, without the icon box: a letter tile or an image. */
  readonly media?: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        {props.icon ? (
          <EmptyMedia variant="icon">{props.icon}</EmptyMedia>
        ) : null}
        {props.media ? <EmptyMedia>{props.media}</EmptyMedia> : null}
        <EmptyTitle>{props.title}</EmptyTitle>
        <EmptyDescription>{props.description}</EmptyDescription>
      </EmptyHeader>
      {props.action ? <EmptyContent>{props.action}</EmptyContent> : null}
    </Empty>
  );
}
