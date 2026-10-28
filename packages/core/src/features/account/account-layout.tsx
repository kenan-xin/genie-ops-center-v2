import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@genie/ui";
import type { JSX, ReactNode } from "react";

import { PageHeader } from "../shell/page-header.tsx";

/**
 * The frame of both account pages (fix list "Account page layout"): the header at the content's
 * left edge, as on the admin pages, and one bordered card per block, 16 px apart.
 */
export function AccountLayout(props: {
  readonly testId: string;
  readonly description: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    // 48 rem (`max-w-3xl`) is 720 px at the default 15 px root size, too narrow for the sessions
    // table, and rem keeps the table fitting at every font size preset.
    <main className="w-full max-w-4xl pb-8" data-testid={props.testId}>
      {/* The header keeps its own 24 px gap above the first card. */}
      <PageHeader title="Account" description={props.description} />
      <div className="flex flex-col gap-4">{props.children}</div>
    </main>
  );
}

/**
 * One block: the title and the description over rows divided from each other. A row brings its
 * own padding, so a table or a list runs from edge to edge.
 */
export function AccountCard(props: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <Card variant="divided">
      <CardHeader>
        <h2
          data-slot="card-title"
          className="text-lg font-bold text-foreground"
        >
          {props.title}
        </h2>
        <CardDescription>{props.description}</CardDescription>
        {props.action === undefined ? null : (
          // On a phone the action drops under the description, as in the mobile capture.
          <CardAction className="max-md:col-start-1 max-md:row-span-1 max-md:row-start-3 max-md:mt-2 max-md:justify-self-start">
            {props.action}
          </CardAction>
        )}
      </CardHeader>
      {props.children}
    </Card>
  );
}

/** A padded row of an account card; `className` lays out the row's own content. */
export function AccountCardRow(props: {
  readonly className?: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <CardContent>
      <div className={`flex flex-col gap-2 ${props.className ?? ""}`}>
        {props.children}
      </div>
    </CardContent>
  );
}
