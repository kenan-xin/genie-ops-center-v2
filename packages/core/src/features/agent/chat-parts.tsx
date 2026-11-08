"use client";

import { focusRing, infoTint } from "@genie/ui";
import { ArrowRightIcon, ChevronRightIcon, SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { InboxLink } from "../../services/agent/index.ts";

/** The small parts every agent chat frame shares, written once (duplicates 4, 5, 6 and 9). */

export const linkClass = `text-sm font-medium text-foreground underline-offset-4 hover:underline ${focusRing}`;

const pillClass = `inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-start text-sm text-muted-foreground hover:border-input hover:bg-muted hover:text-foreground lg:min-h-8 ${focusRing}`;

/** Questions as pill buttons with an arrow: a new chat's starters and Ask next (czjw.120 item 8). */
export function QuestionPills(props: {
  readonly label: string;
  readonly questions: readonly string[];
  readonly onPick: (question: string) => void;
}): ReactNode {
  return (
    <div role="group" aria-label={props.label} className="flex flex-wrap gap-2">
      {props.questions.map((question) => (
        <button
          key={question}
          type="button"
          className={pillClass}
          onClick={() => props.onPick(question)}
        >
          {question}
          <ArrowRightIcon
            aria-hidden="true"
            className="size-3.5 shrink-0"
            strokeWidth={1.75}
          />
        </button>
      ))}
    </div>
  );
}

/** The agent's mark: a 22 px blue-tint tile in the finished steps pill and the empty state. */
export function AgentMark(): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={`grid size-5.5 shrink-0 place-items-center rounded-md ${infoTint}`}
    >
      <SparklesIcon
        className="size-3.5 text-primary dark:text-brand-on-dark"
        strokeWidth={1.75}
      />
    </span>
  );
}

/**
 * A muted fold under an answer or a divider: a chevron that turns and a label. 44 px high under
 * 1024 px, so a finger reaches it (FL15).
 */
export function QuietFold(props: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <details className="group text-sm">
      <summary
        className={`inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-md font-medium text-muted-foreground hover:text-foreground lg:min-h-8 ${focusRing}`}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className="size-4 group-open:rotate-90 motion-safe:transition-transform"
          strokeWidth={1.75}
        />
        {props.label}
      </summary>
      {props.children}
    </details>
  );
}

/** One line per readable inbox: where documents go in (R-42). */
export function InboxLines(props: {
  readonly inbox: readonly InboxLink[];
}): ReactNode {
  return props.inbox.map((link) => (
    <p key={link.href} className="text-sm text-muted-foreground">
      To add documents, use{" "}
      <a href={link.href} className={linkClass}>
        {link.label}
      </a>
      .
    </p>
  ));
}

/** A new chat: what the agent answers from, the inbox lines and the starter questions. */
export function ChatEmpty(props: {
  readonly headingLevel: 2 | 3;
  readonly inbox: readonly InboxLink[];
  readonly suggestions: readonly string[];
  readonly onPick: (question: string) => void;
}): ReactNode {
  const Heading = props.headingLevel === 2 ? "h2" : "h3";

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <AgentMark />
        <Heading className="text-base font-semibold">
          What would you like to know?
        </Heading>
      </div>
      <p className="text-sm text-muted-foreground">
        I answer from the records you can see, and show where each figure comes
        from.
      </p>
      <InboxLines inbox={props.inbox} />
      {props.suggestions.length === 0 ? null : (
        <div className="pt-1">
          <QuestionPills
            label="Suggestions"
            questions={props.suggestions}
            onPick={props.onPick}
          />
        </div>
      )}
    </div>
  );
}
