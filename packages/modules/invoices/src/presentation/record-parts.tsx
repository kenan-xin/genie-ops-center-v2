import {
  buttonVariants,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@genie/ui";
import { ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";

import { HistoryList, LINKS_LABEL } from "./allocations.tsx";
import type { LinkedRecord } from "./history-text.ts";
import { RecordLinks } from "./link-dialogs.tsx";
import type { AllocationRow, HistoryRow } from "./views.ts";

/** One field of the Details card; `wide` takes both columns. */
export function Fact(props: {
  readonly label: string;
  readonly wide?: true;
  readonly children: ReactNode;
}) {
  return (
    <div className={props.wide ? "col-span-2" : "min-w-0"}>
      <dt className="text-xs font-semibold text-muted-foreground">
        {props.label}
      </dt>
      <dd className="mt-0.5 text-sm wrap-break-word">{props.children}</dd>
    </div>
  );
}

/** The source PDF in a new tab; the short label shows, the long one is read out (choice 6). */
export function OpenPdfLink(props: { readonly href: string }) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noopener"
      className={buttonVariants({ variant: "secondary" })}
    >
      <ExternalLinkIcon aria-hidden="true" />
      Open the PDF
      <span className="sr-only"> (source document, opens in a new tab)</span>
    </a>
  );
}

function CardHeading(props: {
  readonly id: string;
  readonly title: string;
  readonly aside?: ReactNode;
}) {
  return (
    <CardHeader>
      <CardTitle>
        <h2 id={props.id} className="font-semibold">
          {props.title}
        </h2>
      </CardTitle>
      {props.aside === undefined ? null : (
        <CardAction>{props.aside}</CardAction>
      )}
    </CardHeader>
  );
}

/**
 * A record's body under its strip: Details and the links card side by side from `xl`, the
 * links card wider because its table holds four columns, then History (2.3, 2.4, 2.5).
 */
export function RecordBody(props: {
  readonly id: string;
  readonly facts: ReactNode;
  readonly other: LinkedRecord;
  readonly allocations: readonly AllocationRow[];
  readonly history: readonly HistoryRow[];
  readonly canWrite: boolean;
  readonly timeZone: string;
  /** An action on the links, such as "Link to an invoice", shown in the links card. */
  readonly linkAction?: ReactNode;
}) {
  const { id, other } = props;
  const linked = props.allocations.length;

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-5 xl:items-start">
        <section aria-labelledby={`${id}-details`} className="xl:col-span-2">
          <Card>
            <CardHeading id={`${id}-details`} title="Details" />
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                {props.facts}
              </dl>
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby={`${id}-links`} className="xl:col-span-3">
          <Card>
            <CardHeading
              id={`${id}-links`}
              title={LINKS_LABEL[other]}
              aside={
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {`${linked} linked`}
                  </span>
                  {props.linkAction}
                </div>
              }
            />
            <CardContent>
              <RecordLinks
                rows={props.allocations}
                other={other}
                canWrite={props.canWrite}
              />
            </CardContent>
          </Card>
        </section>
      </div>
      <section aria-labelledby={`${id}-history`}>
        <h2 id={`${id}-history`} className="mb-2 text-base font-semibold">
          History
        </h2>
        {props.history.length === 0 ? (
          <p className="text-sm">No link has changed yet.</p>
        ) : (
          <HistoryList
            rows={props.history}
            other={other}
            timeZone={props.timeZone}
          />
        )}
      </section>
    </>
  );
}
