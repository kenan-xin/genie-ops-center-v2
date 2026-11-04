"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@genie/ui";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useId, type ReactNode } from "react";

const MESSAGE_LIMIT = 4000;

const HINT = "Enter sends. Shift and Enter start a new line.";

/**
 * The agent composer of both frames (I18, AG20): one bordered `InputGroup` that draws the only
 * focus ring, the textbox, the model picker of a new chat, and one round button that is Send, or
 * Stop while an answer streams. Send stays disabled until the text holds more than spaces.
 */
export function Composer(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
  readonly busy: boolean;
  /** The model picker of a new chat, inside the composer; undefined hides it. */
  readonly picker?: ReactNode;
}): ReactNode {
  const hintId = useId();

  const empty = props.value.trim() === "";

  return (
    <div className="grid gap-1.5">
      <InputGroup>
        <InputGroupTextarea
          aria-label="Message"
          aria-describedby={hintId}
          rows={1}
          maxLength={MESSAGE_LIMIT}
          placeholder="Ask a question"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;

            event.preventDefault();

            if (!props.busy && !empty) props.onSend();
          }}
        />
        <InputGroupAddon align="block-end">
          {props.picker}
          {props.busy ? (
            <InputGroupButton
              variant="primary"
              size="icon-round"
              aria-label="Stop the answer"
              className="ms-auto"
              onClick={props.onStop}
            >
              <SquareIcon aria-hidden="true" fill="currentColor" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              variant="primary"
              size="icon-round"
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
      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
        <p>Answers come from the records you can see.</p>
        <p id={hintId}>{HINT}</p>
      </div>
    </div>
  );
}
