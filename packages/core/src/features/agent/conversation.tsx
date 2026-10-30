"use client";

import { useChat } from "@ai-sdk/react";
import {
  Button,
  Field,
  FieldLabel,
  focusRing,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@genie/ui";
import type { ChatTransport } from "ai";
import { useId, useState, type ReactNode } from "react";

import type { AgentMessage } from "../../services/agent/index.ts";
import { ChartCheckProvider, type CheckChart } from "./chart-check.tsx";
import { MessageParts } from "./message-parts.tsx";
import { refusalOf } from "./transport.ts";

const MESSAGE_LIMIT = 4000;

const linkClass = `text-sm font-medium text-foreground underline-offset-4 hover:underline ${focusRing}`;

/**
 * One agent chat (R-40, R-18): the session's messages, the model picker of a new chat, and the
 * composer. The picked model goes with the first message only, because the session keeps the model
 * the first message fixed (P4). While an answer streams, nothing sends again (B9.1).
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
  readonly onFinished?: (sessionId: string) => void;
}): ReactNode {
  const [draft, setDraft] = useState("");

  const pickerId = useId();

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

  function submit(): void {
    const text = draft.trim();

    if (text === "" || busy) return;

    setDraft("");

    void chat.sendMessage(
      { text },
      showPicker && modelId !== "" ? { body: { modelId } } : undefined
    );
  }

  return (
    <ChartCheckProvider check={props.checkChart} timeZone={props.timeZone}>
      <div className="grid gap-4">
        <div
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          className="grid gap-3"
        >
          {chat.messages.map((message, index) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "ms-auto max-w-2xl rounded-lg bg-muted px-3 py-2"
                  : ""
              }
            >
              <MessageParts
                message={message}
                streaming={
                  busy &&
                  message.role === "assistant" &&
                  index === chat.messages.length - 1
                }
              />
            </div>
          ))}
        </div>

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

        <div className="grid gap-2">
          <Textarea
            aria-label="Message Ask"
            rows={3}
            maxLength={MESSAGE_LIMIT}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="flex justify-end">
            <Button
              onClick={submit}
              loading={busy}
              disabled={busy || draft.trim() === ""}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </ChartCheckProvider>
  );
}
