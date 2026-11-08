"use client";

import { useChat } from "@ai-sdk/react";
import {
  Bubble,
  BubbleContent,
  Button,
  Message,
  MessageContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useMediaQuery,
} from "@genie/ui";
import type { ChatTransport } from "ai";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";

import type {
  AgentFile,
  AgentMessage,
  ChatLabels,
  InboxLink,
} from "../../services/agent/index.ts";
import { isStopped, keptOnStop } from "../../services/agent/stopped-turn.ts";
import type { ArtifactCardAction } from "./artifact-card.tsx";
import { ChartCheckProvider, type CheckChart } from "./chart-check.tsx";
import { ChatEmpty, pillClass } from "./chat-parts.tsx";
import { Composer } from "./composer.tsx";
import { MessageParts } from "./message-parts.tsx";
import { SummaryLine } from "./summary-line.tsx";
import {
  type LiveSummary,
  liveSummarySchema,
  summaryBoundary,
} from "./summary.ts";
import { refusalOf } from "./transport.ts";

const storedTime = z.object({ createdAt: z.iso.datetime({ offset: true }) });

/** A stored answer's time: its own time minus its question's (AG16). */
function storedDuration(
  messages: readonly AgentMessage[],
  index: number
): number | undefined {
  const answer = storedTime.safeParse(messages[index]?.metadata);

  const question = storedTime.safeParse(messages[index - 1]?.metadata);

  return answer.success && question.success
    ? Date.parse(answer.data.createdAt) - Date.parse(question.data.createdAt)
    : undefined;
}

/** The text of the question before an answer, which Try again sends again (AG17). */
function questionBefore(
  messages: readonly AgentMessage[],
  index: number
): string | undefined {
  const question = messages[index - 1];

  if (question?.role !== "user") return undefined;

  return question.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

/**
 * One agent chat (R-40, R-18), laid out as a chat (Section 7 redesign, agent-native rules 2, 5
 * and 6): the empty state of a new chat, the person's message in a muted bubble at the right, the
 * answer as plain text on the same left edge with its steps and artifact cards, suggestion
 * chips, and the `Composer`. The frame (the panel or Ask) gives what a card does and New chat. The picked model goes with the first
 * message only, because the session keeps the model the first message fixed (P4). While an answer
 * streams, nothing sends again (B9.1), and Stop ends it with its words kept (I18).
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
  /** The words for tool steps and dataset titles, so no internal name shows (6.3). */
  readonly labels: ChatLabels;
  /** Starter questions; hidden while an answer streams or after a refusal. */
  readonly suggestions: readonly string[];
  /** The inbox lines of a new chat's empty state (R-42). */
  readonly inbox: readonly InboxLink[];
  /** What an artifact card does in this frame. */
  readonly artifacts: ArtifactCardAction;
  /** The empty state's heading level in the frame's outline. */
  readonly headingLevel: 2 | 3;
  /** Starts a new chat, the one recovery from a model the administrator removed. */
  readonly onNewChat: () => void;
  /** Tells the frame whether an answer streams, for its working state (R-42). */
  readonly onWorking?: ((working: boolean) => void) | undefined;
  /**
   * A message the page asks to send, for example a starter chip outside the chat. `onSent` runs
   * once it went out, so the page clears it; a pending that stayed set would send again.
   */
  readonly pending?:
    | { readonly text: string; readonly onSent: () => void }
    | undefined;
  readonly onFinished?: ((sessionId: string) => void) | undefined;
  /**
   * A frame that shows the model choice itself below 1024 px passes the chosen model; the composer
   * then shows its picker only from 1024 px (czjw.120 item 12).
   */
  readonly model?:
    | { readonly value: string; readonly onChange: (model: string) => void }
    | undefined;
  /** The chat's list files, for the file cards and the timeline (R-44a). */
  readonly files?: readonly AgentFile[] | undefined;
  /** Answers a download link for a file id; undefined shows no file card. */
  readonly onDownload?: ((id: string) => Promise<string>) | undefined;
}): ReactNode {
  const [draft, setDraft] = useState("");

  // A live answer's time, from the send to its end, by message id.
  const [liveTimes, setLiveTimes] = useState<Readonly<Record<string, number>>>(
    {}
  );

  const sentAt = useRef(0);

  // The summary this session's latest turn made, which the stored messages carry only after a load.
  const [liveSummary, setLiveSummary] = useState<LiveSummary | null>(null);

  const [ownModel, setOwnModel] = useState(
    props.models?.chatDefault ?? props.models?.allowed[0] ?? ""
  );

  const modelId = props.model?.value ?? ownModel;

  const setModelId = props.model?.onChange ?? setOwnModel;

  const wide = useMediaQuery("(min-width: 1024px)", {});

  const chat = useChat<AgentMessage>({
    id: props.sessionId,
    messages: [...props.initialMessages],
    transport: props.transport,
    onData: (part) => {
      if (part.type !== "data-summary") return;

      const parsed = liveSummarySchema.safeParse(part.data);

      if (parsed.success) setLiveSummary(parsed.data);
    },
    // A refusal stores no answer, so it earns no list refresh or navigation (B9.4).
    onFinish: ({ isAbort, isError, message }) => {
      setLiveTimes((times) => ({
        ...times,
        [message.id]: Date.now() - sentAt.current,
      }));

      // Stop, or the server's turn limit, keeps what the server stores: the finished steps and
      // words, and the Stopped line (P03-2).
      if (
        (isAbort || isStopped(message)) &&
        message.role === "assistant" &&
        message.parts.length > 0
      ) {
        chat.setMessages((messages) =>
          messages.map((each) =>
            each.id === message.id
              ? { ...each, parts: keptOnStop(each.parts, []).parts }
              : each
          )
        );
      }

      if (!isError) props.onFinished?.(props.sessionId);
    },
  });

  const busy = chat.status === "submitted" || chat.status === "streaming";

  const refusal = refusalOf(chat.error);

  // A refused first send stores no answer, so the chat is still new and keeps its picker (R-18).
  const answered = chat.messages.some(
    (message) => message.role === "assistant"
  );

  // The first message of a new chat carries the model, wherever the person picked it.
  const isNewChat = props.models !== null && !answered;

  const showPicker = isNewChat && (props.model === undefined || wide);

  const modelItems =
    props.models?.allowed.map((model) => ({ value: model, label: model })) ??
    [];

  function send(value: string): void {
    const text = value.trim();

    if (text === "" || busy) return;

    setDraft("");

    sentAt.current = Date.now();

    void chat.sendMessage(
      { text },
      isNewChat && modelId !== "" ? { body: { modelId } } : undefined
    );
  }

  const { pending } = props;

  // Waits for a streaming answer to finish, like a typed message (B9.1).
  useEffect(() => {
    if (pending === undefined || busy) return;

    send(pending.text);
    pending.onSent();
  }, [pending?.text, busy]);

  const { onWorking } = props;

  useEffect(() => {
    onWorking?.(busy);
  }, [busy, onWorking]);

  const isNew = chat.messages.length === 0;

  const boundary = summaryBoundary(chat.messages, liveSummary);

  // A new chat offers its starters in the empty state; later they sit above the composer.
  const showSuggestions =
    !isNew && !busy && refusal === null && props.suggestions.length > 0;

  // One centered 720 px column with its gutter, so every row shares one left edge (czjw.120 item 1,
  // czjw.109).
  const column = "mx-auto w-full max-w-180 px-4 md:px-6";

  return (
    <ChartCheckProvider
      check={props.checkChart}
      timeZone={props.timeZone}
      datasetTitles={props.labels.datasets}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {isNew ? (
          <div className={`py-4 md:py-5 ${column}`}>
            <ChatEmpty
              headingLevel={props.headingLevel}
              inbox={props.inbox}
              suggestions={refusal === null ? props.suggestions : []}
              onPick={send}
            />
          </div>
        ) : null}
        <div
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
        >
          {/* No wrapper in an empty log, so it stays empty for a reader and a test. */}
          {chat.messages.length === 0 ? null : (
            <div className={`flex flex-col gap-6 pt-5 pb-2 md:pt-7 ${column}`}>
              {chat.messages.map((message, index) => (
                <Fragment key={message.id}>
                  {message.role === "user" ? (
                    <Message align="end">
                      <Bubble variant="muted" align="end">
                        <BubbleContent>
                          <span className="sr-only">You: </span>
                          <MessageParts message={message} streaming={false} />
                        </BubbleContent>
                      </Bubble>
                    </Message>
                  ) : (
                    <Message>
                      <MessageContent>
                        <span className="sr-only">Answer:</span>
                        <MessageParts
                          message={message}
                          labels={props.labels}
                          streaming={busy && index === chat.messages.length - 1}
                          durationMs={
                            liveTimes[message.id] ??
                            storedDuration(chat.messages, index)
                          }
                          onTryAgain={() => {
                            const question = questionBefore(
                              chat.messages,
                              index
                            );

                            if (question !== undefined) send(question);
                          }}
                          artifacts={props.artifacts}
                          files={props.files}
                          onDownload={props.onDownload}
                        />
                      </MessageContent>
                    </Message>
                  )}
                  {boundary?.messageId === message.id ? (
                    <SummaryLine
                      summary={boundary.summary}
                      datasetTitles={props.labels.datasets}
                    />
                  ) : null}
                </Fragment>
              ))}
            </div>
          )}
        </div>

        {/* The dock sits on the page white with no hairline (czjw.120 item 9). */}
        <div className="shrink-0 bg-background pt-2 pb-3 md:pb-3.5">
          <div className={`grid gap-3 ${column}`}>
            {refusal === null ? null : (
              <div
                role="alert"
                className="grid gap-2 rounded-lg border border-border p-3"
              >
                <p className="text-sm">{refusal.message}</p>
                {refusal.requiresNewChat ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={props.onNewChat}
                  >
                    Start a new chat
                  </Button>
                ) : null}
              </div>
            )}

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
                    className={pillClass}
                    onClick={() => send(question)}
                  >
                    {question}
                  </button>
                ))}
              </div>
            ) : null}

            <Composer
              value={draft}
              onChange={setDraft}
              onSend={() => send(draft)}
              onStop={() => void chat.stop()}
              busy={busy}
              datasetTitles={Object.values(props.labels.datasets)}
              picker={
                showPicker ? (
                  <Select
                    items={modelItems}
                    value={modelId}
                    onValueChange={(value) => setModelId(value ?? "")}
                  >
                    <SelectTrigger
                      aria-label="Model"
                      size="sm"
                      // oxlint-disable-next-line shadcn/no-restyle -- a compact picker inside the composer (variant B)
                      className="w-auto max-w-56 border-0 bg-transparent max-lg:h-11"
                    >
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
                ) : undefined
              }
            />
          </div>
        </div>
      </div>
    </ChartCheckProvider>
  );
}
