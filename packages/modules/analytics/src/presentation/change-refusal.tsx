"use client";

import { type AppIssue, appCodeOf, appIssuesOf } from "@genie/core/rpc/client";
import { Button } from "@genie/ui";
import { useEffect, useRef } from "react";

export type ChangeFailure = {
  readonly kind: "change" | "undo";
  readonly panelTitle?: string | undefined;
  readonly error: unknown;
};

type Refusal = {
  readonly message: string;
  readonly issues: readonly AppIssue[];
  readonly reload: boolean;
};

/** The refusal line of an edit, its issue lines and whether Reload follows (R-49). */
function refusalOf(failure: ChangeFailure): Refusal {
  const message = failure.error instanceof Error ? failure.error.message : "";
  const issues = appIssuesOf(failure.error);
  const reload = appCodeOf(failure.error) === "analytics:dashboard-changed";

  if (failure.kind === "undo") {
    return {
      message: `The last change was not undone. ${message}`,
      issues,
      reload,
    };
  }

  if (reload) return { message, issues, reload };

  return {
    message:
      failure.panelTitle === undefined
        ? message
        : `${failure.panelTitle} was not changed. ${message}`,
    issues,
    reload,
  };
}

/** A refused dashboard save, with Reload when another save moved the version. */
export function ChangeRefusal(props: {
  readonly failure: ChangeFailure;
  readonly onReload: () => void;
  /** Takes focus when it shows, so the person hears it (DESIGN.md "Save failures"). */
  readonly focus?: boolean | undefined;
}) {
  const alert = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.focus === true) alert.current?.focus();
  }, [props.focus]);

  const { message, issues, reload } = refusalOf(props.failure);

  return (
    <div
      ref={alert}
      role="alert"
      tabIndex={props.focus === true ? -1 : undefined}
      className="grid gap-1 text-sm text-destructive outline-none"
    >
      <p>{message === "" ? "The change was not saved." : message}</p>
      {issues.map((issue, index) => (
        <p key={`${index}:${issue.path}`}>{issue.message}</p>
      ))}
      {reload ? (
        <Button type="button" variant="secondary" onClick={props.onReload}>
          Reload
        </Button>
      ) : null}
    </div>
  );
}
