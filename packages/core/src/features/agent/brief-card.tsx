"use client";

import { focusRing } from "@genie/ui";
import { ForwardIcon } from "lucide-react";
import type { ReactNode } from "react";
import { z } from "zod";

import type { AgentMessage } from "../../services/agent/index.ts";

/** The parts of a `data-brief` part that the chat shows, checked where the chat reads it. */
const briefSchema = z.object({
  goal: z.string(),
  facts: z.array(z.object({ text: z.string() })),
});

export type ShownBrief = {
  readonly goal: string;
  readonly facts: readonly { readonly text: string }[];
};

/** The brief of a handed-over chat's first message, or undefined for any other message. */
export function briefPartOf(message: AgentMessage): ShownBrief | undefined {
  const part = message.parts.find(({ type }) => type === "data-brief");

  const parsed = briefSchema.safeParse(
    part !== undefined && "data" in part ? part.data : undefined
  );

  return parsed.success ? parsed.data : undefined;
}

/**
 * The first message of a handed-over chat (S7-41, prototype `agent-handoff` variant A): what Ask
 * passed, in place of the person's bubble, with a link back to the Ask chat while it exists.
 */
export function BriefCard(props: {
  readonly brief: ShownBrief;
  readonly askHref: string | undefined;
}): ReactNode {
  return (
    <div className="grid gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-sm">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-primary dark:text-brand-on-dark">
        <ForwardIcon
          aria-hidden="true"
          strokeWidth={1.75}
          className="size-3.5"
        />
        From Ask
      </p>
      <p>{props.brief.goal}</p>
      {props.brief.facts.length === 0 ? null : (
        <ul className="grid list-disc gap-0.5 ps-5 text-muted-foreground">
          {props.brief.facts.map(({ text }) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
      {props.askHref === undefined ? null : (
        <a
          href={props.askHref}
          className={`inline-flex min-h-11 w-fit items-center rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline lg:min-h-8 dark:text-brand-on-dark ${focusRing}`}
        >
          Open the Ask chat
        </a>
      )}
    </div>
  );
}
