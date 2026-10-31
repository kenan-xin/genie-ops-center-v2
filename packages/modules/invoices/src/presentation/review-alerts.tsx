"use client";

import { PageLink } from "@genie/core/features/shell";
import { Button, WarningNote } from "@genie/ui";
import type { ReactNode } from "react";

/** A document whose key facts match a stored record: keep it or save it anyway (R-33). */
export function DuplicateNotice(props: {
  readonly href: string;
  readonly pending: boolean;
  readonly onKeep: () => void;
  readonly onDiscard: () => void;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <WarningNote>
        A record with the same key facts is saved already.
      </WarningNote>
      <div className="flex flex-wrap items-center gap-2">
        <PageLink href={props.href}>Open it</PageLink>
        <Button loading={props.pending} onClick={props.onKeep}>
          Keep and save
        </Button>
        <Button variant="secondary" onClick={props.onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}

/** One refusal line under the form; the message already names the document (R-33). */
export function SaveFailure(props: {
  readonly message: string | null;
}): ReactNode {
  return props.message === null ? null : (
    <p role="alert" className="text-sm text-destructive">
      {props.message}
    </p>
  );
}
