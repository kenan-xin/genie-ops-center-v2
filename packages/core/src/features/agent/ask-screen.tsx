"use client";

import {
  Button,
  buttonVariants,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useMediaQuery,
} from "@genie/ui";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import {
  EllipsisIcon,
  HistoryIcon,
  PanelLeftIcon,
  SquarePenIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { useModuleClient } from "../../lib/rpc/module-client.tsx";
import {
  agentContract,
  chatTitleSchema,
} from "../../services/agent/contract.ts";
import type { HandoffCardData } from "../../services/agent/hand-over.ts";
import type {
  AgentArtifact,
  AgentSessionSummary,
  ChatLabels,
} from "../../services/agent/index.ts";
import type { Read } from "./answer-sources.ts";
import type { ArtifactRef } from "./artifact-refs.ts";
import { ArtifactSheet, ArtifactSlot } from "./artifact-slot.tsx";
import { ChatHistory } from "./chat-history.tsx";
import { HandoffChip } from "./handoff-card.tsx";

/** From this width an open artifact sits in a column beside the chat (AG22). */
const ARTIFACT_DOCKED = "(min-width: 1280px)";

/** The rename dialog, mounted only while open, so each open starts from the chat's title. */
function RenameChat(props: {
  readonly id: string;
  readonly title: string;
  readonly onClose: () => void;
  readonly onRenamed: () => void;
}): ReactNode {
  const agent = useModuleClient(agentContract);
  const nameId = useId();

  // The list refresh runs for every saved rename; the close is this dialog's own, so a late
  // answer after Cancel cannot close a dialog opened again (the per-call callback skips it).
  const rename = useMutation({
    mutationFn: (title: string) => agent.rename({ id: props.id, title }),
    onSuccess: props.onRenamed,
  });

  const form = useForm({
    defaultValues: { title: props.title },
    onSubmit: ({ value }) =>
      rename.mutate(value.title, { onSuccess: props.onClose }),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename this chat</DialogTitle>
          </DialogHeader>
          <form.Field
            name="title"
            validators={{
              onChange: chatTitleSchema,
              onSubmit: chatTitleSchema,
            }}
          >
            {(field) => {
              const issue: { message?: string } | undefined =
                field.state.meta.errors[0];

              const message = issue?.message;

              return (
                <Field>
                  <FieldLabel htmlFor={nameId}>Name</FieldLabel>
                  <Input
                    id={nameId}
                    value={field.state.value}
                    aria-invalid={message === undefined ? undefined : true}
                    aria-describedby={
                      message === undefined ? undefined : `${nameId}-error`
                    }
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  {message === undefined ? null : (
                    <FieldError id={`${nameId}-error`}>{message}</FieldError>
                  )}
                </Field>
              );
            }}
          </form.Field>
          {rename.isError ? (
            <p role="alert" className="text-sm text-destructive">
              The name could not be saved. Try again.
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={rename.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The Ask frame (R-42, R-42a, R-45a, AG22): the chat history as a 272 px column from 1024 px that
 * hides fully on its own toggle, and a left sheet below; the chat in the middle; and the artifact
 * panel, a 480 px column from 1280 px and a sheet below, open only when the person opens a card.
 * A read's rows (czjw.108) take the same place. The chat itself is the shared `AgentChat`, passed as `children`; only this frame is Ask's own.
 * One 56 px header holds the title and Chat actions: Rename and Delete for a saved chat, and below
 * 1024 px the model of a new chat (czjw.120 items 12 and 13).
 */
export function AskScreen(props: {
  readonly sessions: readonly AgentSessionSummary[];
  readonly currentId: string | undefined;
  /** The session title, or "New chat". */
  readonly title: string;
  readonly sessionHref: (id: string) => string;
  readonly newChatHref: string;
  readonly aiOn: boolean;
  /** The tenant's zone for each chat's day. */
  readonly timeZone: string;
  /** Dataset titles and field labels, for the artifact's caption and a read's rows. */
  readonly labels: ChatLabels;
  readonly artifacts: readonly AgentArtifact[];
  readonly shown: ArtifactRef | null;
  readonly onShow: (ref: ArtifactRef | null) => void;
  /** The read whose rows show in the artifact's place; the route keeps it apart from `shown`. */
  readonly rows: Read | null;
  readonly onRows: (read: Read | null) => void;
  /** A new chat's model, which the header menu offers below 1024 px; null for a saved chat. */
  readonly models: {
    readonly allowed: readonly string[];
    readonly value: string;
    readonly onChange: (model: string) => void;
  } | null;
  readonly onRenamed: () => void;
  readonly onDeleted: () => void;
  /** The chat's last handoff; the header links to its work while it builds (R-42b). */
  readonly handoff?: HandoffCardData | undefined;
  readonly children: ReactNode;
}): ReactNode {
  const agent = useModuleClient(agentContract);
  const docked = useMediaQuery(ARTIFACT_DOCKED, {});
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historySheet, setHistorySheet] = useState(false);
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);

  const { currentId, models } = props;

  const remove = useMutation({
    mutationFn: (id: string) => agent.remove({ id }),
    onSuccess: () => {
      setDialog(null);
      props.onDeleted();
    },
  });

  // The rail, its phone sheet and the phone header each start a chat with the pencil.
  const newChat = (extra = "") => (
    <a
      href={props.newChatHref}
      aria-label="New chat"
      className={`${buttonVariants({ variant: "ghost", size: "icon" })} ${extra}`}
    >
      <SquarePenIcon aria-hidden="true" strokeWidth={1.75} />
    </a>
  );

  // A saved chat has its actions at every width; a new chat has only its model, below 1024 px.
  const chatActions =
    currentId === undefined && models === null ? null : (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Chat actions"
              className={currentId === undefined ? "lg:hidden" : undefined}
            />
          }
        >
          <EllipsisIcon aria-hidden="true" strokeWidth={1.75} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {currentId !== undefined ? (
            <>
              <DropdownMenuItem onClick={() => setDialog("rename")}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("delete")}>
                Delete
              </DropdownMenuItem>
            </>
          ) : models === null ? null : (
            <DropdownMenuRadioGroup
              aria-label="Model"
              value={models.value}
              onValueChange={(value: string) => models.onChange(value)}
            >
              {models.allowed.map((model) => (
                <DropdownMenuRadioItem key={model} value={model}>
                  {model}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );

  // The toggle moves between the column and the top bar, so focus follows it.
  const hideButton = useRef<HTMLButtonElement>(null);
  const showButton = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);

  useEffect(() => {
    if (!toggled.current) return;

    toggled.current = false;
    (historyOpen ? hideButton : showButton).current?.focus();
  }, [historyOpen]);

  const toggleHistory = (open: boolean) => {
    toggled.current = true;
    setHistoryOpen(open);
  };

  const history = (
    <ChatHistory
      sessions={props.sessions}
      currentId={props.currentId}
      sessionHref={props.sessionHref}
      timeZone={props.timeZone}
    />
  );

  const slotOpen = props.shown !== null || props.rows !== null;

  const closeSlot = () => {
    props.onShow(null);
    props.onRows(null);
  };

  const slot = {
    artifacts: props.artifacts,
    shown: props.shown,
    rows: props.rows,
    labels: props.labels,
    timeZone: props.timeZone,
    onShow: props.onShow,
    onClose: closeSlot,
  };

  return (
    <div className="flex min-h-0 flex-1">
      {historyOpen ? (
        <aside
          aria-label="Chat history"
          className="hidden w-68 shrink-0 flex-col border-e border-border bg-muted lg:flex"
        >
          <div className="flex h-14 shrink-0 items-center gap-1 ps-6 pe-3">
            <h2 className="flex-1 text-sm font-bold">Chats</h2>
            {newChat()}
            <Button
              ref={hideButton}
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Hide chats"
              onClick={() => toggleHistory(false)}
            >
              <PanelLeftIcon aria-hidden="true" strokeWidth={1.75} />
            </Button>
          </div>
          {history}
        </aside>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* One header at every width; below 1024 px it sits under the shell's top bar. */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 lg:ps-6 lg:pe-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Show chats"
            className="lg:hidden"
            onClick={() => setHistorySheet(true)}
          >
            <HistoryIcon aria-hidden="true" strokeWidth={1.75} />
          </Button>
          {historyOpen ? null : (
            <Button
              ref={showButton}
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Show chats"
              className="max-lg:hidden"
              onClick={() => toggleHistory(true)}
            >
              <PanelLeftIcon aria-hidden="true" strokeWidth={1.75} />
            </Button>
          )}
          <p
            title={props.title}
            className="min-w-0 flex-1 truncate text-sm font-semibold"
          >
            {props.title}
          </p>
          {props.handoff === undefined ? null : (
            <HandoffChip card={props.handoff} />
          )}
          {newChat("lg:hidden")}
          {chatActions}
        </div>

        <section
          aria-label="Conversation"
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {props.aiOn ? (
            props.children
          ) : (
            <div
              role="status"
              className="m-4 grid gap-1 rounded-lg border border-border p-4"
            >
              <p className="font-semibold">AI is off.</p>
              <p className="text-sm text-muted-foreground">
                Ask needs a model connection. An administrator turns it on in
                Tenant settings.
              </p>
            </div>
          )}
        </section>
      </div>

      {docked ? (
        !slotOpen ? null : (
          <aside
            aria-label="Artifact panel"
            className="flex w-120 shrink-0 flex-col border-s border-border"
          >
            <ArtifactSlot {...slot} variant="column" />
          </aside>
        )
      ) : (
        <ArtifactSheet {...slot} />
      )}

      <Sheet open={historySheet} onOpenChange={setHistorySheet}>
        <SheetContent side="left">
          <SheetHeader>
            <div className="flex items-center gap-1">
              <div className="flex-1">
                <SheetTitle>Chats</SheetTitle>
              </div>
              {newChat()}
            </div>
          </SheetHeader>
          {history}
        </SheetContent>
      </Sheet>

      {dialog === "rename" && currentId !== undefined ? (
        <RenameChat
          id={currentId}
          title={props.title}
          onClose={() => setDialog(null)}
          onRenamed={props.onRenamed}
        />
      ) : null}

      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete this chat?"
        description="This deletes the chat, its tables and charts, and the files it made. You cannot undo this."
        confirmLabel="Delete chat"
        danger
        onConfirm={() => {
          if (currentId !== undefined) remove.mutate(currentId);
        }}
        onClose={() => {
          setDialog(null);
          remove.reset();
        }}
      >
        {remove.isError ? (
          <p role="alert" className="text-sm text-destructive">
            The chat could not be deleted. Try again.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
