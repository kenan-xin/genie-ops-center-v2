"use client";

import { PageLink } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  focusRing,
  IconTile,
} from "@genie/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, FileXIcon, Trash2Icon } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { invoicesContract } from "../contract.ts";
import { paymentLabel } from "./format.ts";
import type { DocumentReviewView } from "./views.ts";

const DOCUMENTS_HREF = "/m/invoices/documents";

const ICONS = {
  saved: CircleCheckIcon,
  discarded: Trash2Icon,
  unread: FileXIcon,
} as const;

/** A link drawn as a button, as the shell's own empty states draw theirs. */
export const linkButton = (variant: "primary" | "secondary") =>
  `${buttonVariants({ variant })} ${focusRing}`;

/** What the save made, in one line: an invoice, a payment, or both for a paid receipt. */
export function savedTitle(
  saved: NonNullable<DocumentReviewView["saved"]>
): string {
  if (saved.invoice !== null && saved.payment !== null)
    return `Saved as a paid receipt: invoice ${saved.invoice.number} and payment ${paymentLabel(saved.payment)}.`;

  if (saved.invoice !== null)
    return `Saved as invoice ${saved.invoice.number}.`;

  if (saved.payment !== null)
    return `Saved as payment ${paymentLabel(saved.payment)}.`;

  return "Saved.";
}

/** One PDF uploaded in place; a module has no programmatic navigation, so its review is a link. */
function UploadAnother(): ReactNode {
  const invoices = useModuleClient(invoicesContract);
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (file: File) => invoices.uploadDocument({ file }),
    // Exact: the list only, so a discarded document's own review is not fetched again.
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: ["invoices", "documents"],
        exact: true,
      }),
  });

  const name = upload.variables?.name ?? "";

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a PDF file"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file !== undefined) upload.mutate(file);

          event.target.value = "";
        }}
      />
      <Button
        variant="secondary"
        loading={upload.isPending}
        onClick={() => input.current?.click()}
      >
        Upload another
      </Button>
      {upload.data === undefined ? null : (
        <p role="status" className="basis-full">
          {upload.data.outcome === "uploaded" ? (
            <>
              {`Uploaded ${name}. It is being read now. `}
              <PageLink
                href={`${DOCUMENTS_HREF}/${upload.data.documentId}`}
              >{`Review ${name}`}</PageLink>
            </>
          ) : (
            <>
              {`${name} is the same file as ${upload.data.label}. Nothing was added. `}
              <PageLink
                href={`${DOCUMENTS_HREF}/${upload.data.documentId}`}
              >{`Open ${upload.data.label}`}</PageLink>
            </>
          )}
        </p>
      )}
      {upload.error === null ? null : (
        <p role="alert" className="basis-full text-destructive">
          {`${name} was not uploaded. ${upload.error.message}`}
        </p>
      )}
    </>
  );
}

/**
 * The end of a review (czjw.64): a card with a status icon, what happened in one line, then the
 * next steps. Saved and discarded replace both panes; could not read sits above them (R-26).
 */
export function ReviewResult(props: {
  readonly tone: "saved" | "discarded" | "unread";
  readonly title: string;
  readonly detail?: string;
  /** The links to the records the save made, first in the actions. */
  readonly records?: ReactNode;
  readonly children?: ReactNode;
  readonly canUpload: boolean;
}): ReactNode {
  const Icon = ICONS[props.tone];

  return (
    <Card>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <IconTile>
              <Icon />
            </IconTile>
            <div className="flex min-w-0 flex-col gap-1 pt-2">
              <p role="status" className="text-base font-semibold">
                {props.title}
              </p>
              {props.detail === undefined ? null : (
                <p className="text-muted-foreground">{props.detail}</p>
              )}
            </div>
          </div>
          {props.children}
          <div className="flex flex-wrap items-center gap-2">
            {props.records}
            {props.canUpload && props.tone !== "unread" ? (
              <UploadAnother />
            ) : null}
            <PageLink href={DOCUMENTS_HREF} className={linkButton("secondary")}>
              Back to Documents
            </PageLink>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
