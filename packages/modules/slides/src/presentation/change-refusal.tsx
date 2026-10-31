"use client";

import { type AppIssue, appCodeOf, appIssuesOf } from "@genie/core/rpc/client";
import { Button } from "@genie/ui";

/** The server's `deck-changed` copy, also used when the open slide has gone. */
export const DECK_CHANGED_COPY =
  "This deck changed since you opened it. Reload it to see the latest version.";

export type ChangeFailure =
  | {
      readonly kind: "change";
      /** The slide's place on the page, shown only for a refused slide change. */
      readonly slideNumber?: number | undefined;
      readonly error: unknown;
    }
  | { readonly kind: "undo" | "refresh" | "export"; readonly error: unknown }
  /** The person's slide is no longer in the deck, so only a reload helps. */
  | { readonly kind: "stale" };

type Refusal = {
  readonly message: string;
  readonly issues: readonly AppIssue[];
  readonly reload: boolean;
};

/** The refusal line of an edit, its issue lines and whether Reload follows (R-53). */
function refusalOf(failure: ChangeFailure): Refusal {
  if (failure.kind === "stale") {
    return { message: DECK_CHANGED_COPY, issues: [], reload: true };
  }

  const message =
    failure.error instanceof Error && failure.error.message !== ""
      ? failure.error.message
      : "The change was not saved.";

  const issues = appIssuesOf(failure.error);
  const reload = appCodeOf(failure.error) === "slides:deck-changed";

  if (failure.kind === "change") {
    // A conflict names no slide: the whole page is stale, and Reload is the way out.
    if (reload || failure.slideNumber === undefined) {
      return { message, issues, reload };
    }

    return {
      message: `Slide ${failure.slideNumber} was not changed. ${message}`,
      issues,
      reload,
    };
  }

  if (failure.kind === "undo") {
    return {
      message: `The last change was not undone. ${message}`,
      issues,
      reload,
    };
  }

  if (failure.kind === "export") {
    return {
      message: `The deck was not exported. ${message}`,
      issues,
      reload,
    };
  }

  return {
    message: `The figures were not refreshed. ${message}`,
    issues,
    reload,
  };
}

/** A refused deck save, with Reload when another save moved the hash (R-53). */
export function ChangeRefusal(props: {
  readonly failure: ChangeFailure;
  readonly onReload: () => void;
}) {
  const { message, issues, reload } = refusalOf(props.failure);

  return (
    <div role="alert" className="grid gap-1 text-sm text-destructive">
      <p>{message}</p>
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
