"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
  useMediaQuery,
} from "@genie/ui";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useId, type ReactNode } from "react";

const MESSAGE_LIMIT = 4000;

const HINT = "Enter sends. Shift and Enter start a new line.";

/** The desktop placeholder from the readable dataset titles, at most three (czjw.120 item 12, P08-7). */
export function askPlaceholder(titles: readonly string[]): string {
  const named = titles.slice(0, 3).map((title) => title.toLowerCase());

  const last = named.pop();

  if (last === undefined) return "Ask a question";

  return named.length === 0
    ? `Ask about your ${last}`
    : `Ask about your ${named.join(", ")} or ${last}`;
}

/**
 * The agent composer of both frames (I18, AG20, czjw.120 items 9 to 12): one bordered `InputGroup`
 * that draws the only focus ring, the textbox on top, and a tools row with the model picker of a
 * new chat and one button that is Send, or Stop while an answer streams. Send stays disabled until
 * the text holds more than spaces. The keyboard hint stays the textbox's description only.
 */
export function Composer(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
  readonly busy: boolean;
  /** The model picker of a new chat, inside the composer; undefined hides it. */
  readonly picker?: ReactNode;
  /** The titles of the datasets the person can read, for the desktop placeholder. */
  readonly datasetTitles?: readonly string[] | undefined;
  /** While a background run builds: "Building" and Stop take Send's place (R-42b). */
  readonly building?:
    | { readonly stopping: boolean; readonly onStop: () => void }
    | undefined;
}): ReactNode {
  const hintId = useId();

  const wide = useMediaQuery("(min-width: 768px)", {});

  const empty = props.value.trim() === "";

  return (
    <div className="grid gap-2">
      {/* oxlint-disable-next-line shadcn/no-restyle -- Composer 1: the 12 px card radius on the page white (czjw.120 item 10) */}
      <InputGroup className="rounded-xl bg-background">
        <InputGroupTextarea
          aria-label="Message"
          aria-describedby={hintId}
          rows={1}
          maxLength={MESSAGE_LIMIT}
          placeholder={askPlaceholder(wide ? (props.datasetTitles ?? []) : [])}
          // oxlint-disable-next-line shadcn/no-restyle -- Composer 1: a 52 px text area on top that grows, then scrolls
          className="max-h-48 min-h-13 px-4 pt-3.5 pb-0"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;

            event.preventDefault();

            if (!props.busy && props.building === undefined && !empty) {
              props.onSend();
            }
          }}
        />
        {/* oxlint-disable-next-line shadcn/no-restyle -- Composer 1: the tools row inside the box */}
        <InputGroupAddon align="block-end" className="pt-1.5 ps-2.5 pe-2 pb-2">
          {props.picker}
          {props.building === undefined ? null : (
            <>
              <span
                role="status"
                className="ms-auto text-xs font-medium text-muted-foreground"
              >
                Building
              </span>
              <InputGroupButton
                variant="secondary"
                size="sm"
                aria-label="Stop building"
                disabled={props.building.stopping}
                onClick={props.building.onStop}
              >
                Stop
              </InputGroupButton>
            </>
          )}
          {props.building !== undefined ? null : props.busy ? (
            <InputGroupButton
              variant="primary"
              size="icon-send"
              aria-label="Stop the answer"
              className="ms-auto"
              onClick={props.onStop}
            >
              <SquareIcon aria-hidden="true" fill="currentColor" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              variant="primary"
              size="icon-send"
              aria-label="Send"
              disabled={empty}
              className="ms-auto"
              onClick={props.onSend}
            >
              <ArrowUpIcon aria-hidden="true" strokeWidth={1.75} />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
      <p className="text-center text-xs text-muted-foreground">
        Answers come from the records you can see.
      </p>
      {/* Hidden, yet still the textbox's description (czjw.120 item 11). */}
      <p id={hintId} hidden>
        {HINT}
      </p>
    </div>
  );
}
