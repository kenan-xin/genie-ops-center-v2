"use client";

import { useChat } from "@ai-sdk/react";
import {
  Bubble,
  BubbleContent,
  Button,
  Field,
  FieldLabel,
  focusRing,
  Message,
  MessageContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@genie/ui";
import type { ChatTransport } from "ai";
import { ArrowUpIcon, SparklesIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import type { AgentMessage, ChatLabels } from "../../services/agent/index.ts";
import { ChartCheckProvider, type CheckChart } from "./chart-check.tsx";
import { MessageParts } from "./message-parts.tsx";
import { refusalOf } from "./transport.ts";

const MESSAGE_LIMIT = 4000;

const linkClass = `text-sm font-medium text-foreground underline-offset-4 hover:underline ${focusRing}`;

const chipClass = `inline-flex min-h-8 items-center rounded-full border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground ${focusRing}`;

const HINT = "Enter sends. Shift and Enter start a new line.";

/**
 * One agent chat (R-40, R-18), laid out as a chat (Section 7 redesign, agent-native rules 2, 5
 * and 6): the person's message in a muted bubble at the right, the answer as plain text under a
 * small agent mark, suggestion chips, and a rounded composer with hint text and a round Send. The
 * picked model goes with the first message only, because the session keeps the model the first
 * message fixed (P4). While an answer streams, nothing sends again (B9.1).
 */
export function Conversation(props: {
  readonly sessionId: string;
  readonly initialMessages: readonly AgentMessage[];
  readonly transport: ChatTransport<AgentMessage>;
  /** null hides the picker; shown only while the chat has no answer (P4). */
  readonly models: {
    readonly allowed: readonly string[];
    readonly chatDefault: string | null;
  } | null;
  readonly checkChart: CheckChart;
  /** The viewer's zone for a chart's read-time caption, from `branding.defaultTimeZone`. */
  readonly timeZone: string;
  readonly newChatHref: string;
  /** The words for tool steps and dataset titles, so no internal name shows (6.3). */
  readonly labels: ChatLabels;
  /** Starter questions above the composer; hidden while an answer streams or after a refusal. */
  readonly suggestions: readonly string[];
  /** The composer's hint text. */
  readonly placeholder?: string;
  /** Shown above the composer while the chat has no message, for example a welcome line. */
  readonly empty?: ReactNode;
  readonly onFinished?: (sessionId: string) => void;
}): ReactNode {
  const [draft, setDraft] = useState("");

  const pickerId = useId();

  const hintId = useId();

  const [modelId, setModelId] = useState(
    props.models?.chatDefault ?? props.models?.allowed[0] ?? ""
  );

  const chat = useChat<AgentMessage>({
    id: props.sessionId,
    messages: [...props.initialMessages],
    transport: props.transport,
    // A refusal stores no answer, so it earns no list refresh or navigation (B9.4).
    onFinish: ({ isError }) => {
      if (!isError) props.onFinished?.(props.sessionId);
    },
  });

  const busy = chat.status === "submitted" || chat.status === "streaming";

  const refusal = refusalOf(chat.error);

  // A refused first send stores no answer, so the chat is still new and keeps its picker (R-18).
  const answered = chat.messages.some(
    (message) => message.role === "assistant"
  );

  const showPicker = props.models !== null && !answered;

  const modelItems =
    props.models?.allowed.map((model) => ({ value: model, label: model })) ??
    [];

  function send(value: string): void {
    const text = value.trim();

    if (text === "" || busy) return;

    setDraft("");

    void chat.sendMessage(
      { text },
      showPicker && modelId !== "" ? { body: { modelId } } : undefined
    );
  }

  const showSuggestions =
    !busy && refusal === null && props.suggestions.length > 0;

  return (
    <ChartCheckProvider
      check={props.checkChart}
      timeZone={props.timeZone}
      datasetTitles={props.labels.datasets}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {props.empty === undefined || chat.messages.length > 0 ? null : (
          <div className="p-4 md:p-5">{props.empty}</div>
        )}
        <div
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4 md:p-5"
        >
          {chat.messages.map((message, index) =>
            message.role === "user" ? (
              <Message key={message.id} align="end">
                <Bubble variant="muted" align="end">
                  <BubbleContent>
                    <span className="sr-only">You: </span>
                    <MessageParts message={message} streaming={false} />
                  </BubbleContent>
                </Bubble>
              </Message>
            ) : (
              <Message key={message.id}>
                <span
                  aria-hidden="true"
                  className="grid size-6 shrink-0 place-items-center self-start rounded-md border border-border bg-muted"
                >
                  <SparklesIcon className="size-3.5" strokeWidth={1.75} />
                </span>
                <MessageContent className="max-w-prose">
                  <span className="sr-only">Answer:</span>
                  <MessageParts
                    message={message}
                    labels={props.labels}
                    streaming={busy && index === chat.messages.length - 1}
                  />
                </MessageContent>
              </Message>
            )
          )}
        </div>

        <div className="grid shrink-0 gap-3 border-t border-border bg-background p-3 md:px-4 md:pb-4">
          {refusal === null ? null : (
            <div
              role="alert"
              className="grid gap-2 rounded-lg border border-border p-3"
            >
              <p className="text-sm">{refusal.message}</p>
              {refusal.requiresNewChat ? (
                <a href={props.newChatHref} className={linkClass}>
                  Start a new chat
                </a>
              ) : null}
            </div>
          )}

          {showPicker ? (
            <Field>
              <FieldLabel id={pickerId}>Model</FieldLabel>
              <Select
                items={modelItems}
                value={modelId}
                onValueChange={(value) => setModelId(value ?? "")}
              >
                <SelectTrigger aria-labelledby={pickerId}>
                  <SelectValue placeholder="Default model" />
                </SelectTrigger>
                <SelectContent>
                  {modelItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {showSuggestions ? (
            <div
              role="group"
              aria-label="Suggestions"
              className="flex flex-wrap gap-1.5"
            >
              {props.suggestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  className={chipClass}
                  onClick={() => send(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid gap-1">
            <div className="flex items-end gap-2 rounded-xl border border-input bg-background py-2 ps-3.5 pe-2 focus-within:ring-2 focus-within:ring-ring">
              <Textarea
                aria-label="Message Ask"
                aria-describedby={hintId}
                rows={1}
                maxLength={MESSAGE_LIMIT}
                placeholder={props.placeholder ?? "Ask a question"}
                value={draft}
                // oxlint-disable-next-line shadcn/no-restyle -- the composer box draws the border and the focus ring (agent-native rule 6)
                className="max-h-36 min-h-8 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send(draft);
                  }
                }}
              />
              <Button
                type="button"
                size="icon-sm"
                aria-label="Send"
                loading={busy}
                disabled={busy || draft.trim() === ""}
                // oxlint-disable-next-line shadcn/no-restyle -- the round Send of the redesign (agent-native rule 6)
                className="rounded-full"
                onClick={() => send(draft)}
              >
                <ArrowUpIcon aria-hidden="true" strokeWidth={1.75} />
              </Button>
            </div>
            <p id={hintId} className="text-xs text-muted-foreground">
              {HINT}
            </p>
          </div>
        </div>
      </div>
    </ChartCheckProvider>
  );
}
