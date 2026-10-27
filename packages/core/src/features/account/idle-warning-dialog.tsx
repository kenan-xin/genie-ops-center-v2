import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@genie/ui";
import { useId, useRef } from "react";
import type { JSX } from "react";

import { formatCountdown } from "../../services/auth/idle.ts";

/** The warning's copy, which the application builds from its catalogue (R-41). */
export type IdleWarningStrings = {
  readonly title: string;
  readonly description: string;
  readonly countdownLabel: string;
  readonly staySignedIn: string;
  readonly signOutNow: string;
  /** The inline error when Stay signed in cannot reach the server. */
  readonly stayFailed: string;
};

/**
 * The idle warning (R-33). It is controlled and has no close path of its own: Escape and an
 * outside press do nothing, so the session is never extended or ended by an accident. Only its
 * two buttons act.
 */
export function IdleWarningDialog(props: {
  readonly open: boolean;
  readonly remainingMs: number;
  readonly strings: IdleWarningStrings;
  readonly signOutAction: string;
  /** The last Stay signed in failed; the warning stays open for another try. */
  readonly failed: boolean;
  readonly onStaySignedIn: () => void;
}): JSX.Element {
  const countdownLabel = useId();

  const staySignedIn = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={props.open}>
      <DialogContent showCloseButton={false} initialFocus={staySignedIn}>
        <DialogHeader>
          <DialogTitle>{props.strings.title}</DialogTitle>
          <DialogDescription>{props.strings.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-1">
          <p id={countdownLabel} className="text-sm text-muted-foreground">
            {props.strings.countdownLabel}
          </p>
          <p
            role="timer"
            aria-labelledby={countdownLabel}
            className="font-mono text-4xl font-semibold tabular-nums"
          >
            {formatCountdown(props.remainingMs)}
          </p>
        </div>
        {props.failed ? (
          <p
            role="alert"
            className="text-sm text-destructive dark:text-destructive-on-dark"
          >
            {props.strings.stayFailed}
          </p>
        ) : null}
        <DialogFooter>
          {/* `contents`, so the button is the footer's flex item like its sibling. */}
          <form method="post" action={props.signOutAction} className="contents">
            <Button type="submit" variant="secondary">
              {props.strings.signOutNow}
            </Button>
          </form>
          <Button ref={staySignedIn} onClick={props.onStaySignedIn}>
            {props.strings.staySignedIn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
