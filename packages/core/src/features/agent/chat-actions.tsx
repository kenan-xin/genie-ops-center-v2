"use client";

import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FieldError,
  FieldLabel,
  Input,
} from "@genie/ui";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { EllipsisIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { useModuleClient } from "../../lib/rpc/module-client.tsx";
import {
  agentContract,
  chatTitleSchema,
} from "../../services/agent/contract.ts";

/** What a history row's menu does after a change: read the list again, and leave a deleted open chat. */
export type ChatRowActions = {
  readonly onChanged: () => void;
  readonly onDeleted: (id: string) => void;
};

/** The rename dialog, mounted only while open, so each open starts from the chat's title. */
export function RenameChat(props: {
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

/** The delete dialog, with its `agent.remove` mutation; it reports the deleted chat's id. */
export function DeleteChat(props: {
  readonly id: string | undefined;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onDeleted: (id: string) => void;
}): ReactNode {
  const agent = useModuleClient(agentContract);

  const remove = useMutation({
    mutationFn: (id: string) => agent.remove({ id }),
    onSuccess: (_, id) => {
      props.onClose();
      props.onDeleted(id);
    },
  });

  return (
    <ConfirmDialog
      open={props.open}
      title="Delete this chat?"
      description="This deletes this chat, its tables and charts, and the files it made. You cannot undo this."
      confirmLabel="Delete chat"
      danger
      onConfirm={() => {
        if (props.id !== undefined) remove.mutate(props.id);
      }}
      onClose={() => {
        props.onClose();
        remove.reset();
      }}
    >
      {remove.isError ? (
        <p role="alert" className="text-sm text-destructive">
          This chat could not be deleted. Try again.
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

/**
 * One history row's menu "Chat actions for <title>": Rename and Delete (czjw.203). `className`
 * sits on the trigger's wrapper.
 */
export function ChatRowMenu(props: {
  readonly id: string;
  readonly title: string;
  readonly actions: ChatRowActions;
  readonly className?: string | undefined;
}): ReactNode {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);

  return (
    <>
      {/* The design system's Button owns its look, so the row's show rule sits on a wrapper. */}
      <div className={props.className}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Chat actions for ${props.title}`}
                // Dense rows from 1024 px: the 44 px area would reach into the next row (P18-41).
                className="lg:after:hidden"
              />
            }
          >
            <EllipsisIcon aria-hidden="true" strokeWidth={1.75} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDialog("rename")}>
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog("delete")}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {dialog === "rename" ? (
        <RenameChat
          id={props.id}
          title={props.title}
          onClose={() => setDialog(null)}
          onRenamed={props.actions.onChanged}
        />
      ) : null}
      <DeleteChat
        id={props.id}
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        onDeleted={props.actions.onDeleted}
      />
    </>
  );
}
