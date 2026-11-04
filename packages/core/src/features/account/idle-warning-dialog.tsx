import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@genie/ui";
import { useRef } from "react";
import type { JSX } from "react";

import { announcedSeconds, formatCountdown } from "../../services/auth/idle.ts";

/** The warning's copy, which the application builds from its catalogue (R-41). */
export type IdleWarningStrings = {
  readonly title: string;
  /** One sentence with `{countdown}` where the timer stands. */
  readonly signOutIn: string;
  /** The live line for a whole number of seconds. */
  readonly announce: (seconds: number) => string;
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
  /** The whole warning's length, which the live line speaks at open. */
  readonly leadMs: number;
  readonly strings: IdleWarningStrings;
  readonly signOutAction: string;
  /** The last Stay signed in failed; the warning stays open for another try. */
  readonly failed: boolean;
  readonly onStaySignedIn: () => void;
}): JSX.Element {
  const staySignedIn = useRef<HTMLButtonElement>(null);

  const [before, after] = props.strings.signOutIn.split("{countdown}");

  return (
    <Dialog open={props.open}>
      <DialogContent showCloseButton={false} initialFocus={staySignedIn}>
        <DialogHeader>
          <DialogTitle>{props.strings.title}</DialogTitle>
          <DialogDescription>
            {before}
            <span
              role="timer"
              className="font-mono font-semibold text-foreground tabular-nums"
            >
              {formatCountdown(props.remainingMs)}
            </span>
            {after}
          </DialogDescription>
        </DialogHeader>
        {/* The timer is silent; this line speaks at open and at 60, 30 and 10 seconds only. */}
        <p className="sr-only" aria-live="polite">
          {props.open
            ? props.strings.announce(
                announcedSeconds(props.remainingMs, props.leadMs)
              )
            : null}
        </p>
        {props.failed ? (
          <p
            role="alert"
            className="text-sm text-destructive dark:text-destructive-on-dark"
          >
            {props.strings.stayFailed}
          </p>
        ) : null}
        {/* No `DialogFooter`: its divider is what the owner asked to lose. Stacked on a phone. */}
        <div className="flex flex-col-reverse gap-2 pt-2 md:flex-row md:justify-end">
          {/* `contents`, so the button is the row's flex item like its sibling. */}
          <form method="post" action={props.signOutAction} className="contents">
            <Button type="submit" variant="secondary">
              {props.strings.signOutNow}
            </Button>
          </form>
          <Button ref={staySignedIn} onClick={props.onStaySignedIn}>
            {props.strings.staySignedIn}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
