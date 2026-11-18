"use client";

import { Sheet, SheetContent, SheetTitle } from "@genie/ui";
import type { ReactNode } from "react";
import { useState } from "react";

import type { AddAssignmentsResult } from "../../services/roles/add-assignments.ts";
import type { RecipientPage } from "../../services/roles/recipients.ts";
import { AddAssignmentForm } from "./add-assignment-form.tsx";
import type { AddAssignmentHost } from "./add-assignment-form.tsx";

/**
 * Add assignment from Access (d8l5.62): a right sheet around the one form, with an empty Assign
 * to. A save in flight keeps the sheet open, and an answer closes it before the page reports it.
 */
export function AddAssignmentSheet(props: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly host: AddAssignmentHost;
  /** `roles.recipients` with `limit: 10`. */
  readonly search: (query: string) => Promise<RecipientPage>;
  /** The viewer: their own row is listed and disabled (P12-3). */
  readonly selfId: string;
  /** The server's answer after a save; the sheet has closed itself. */
  readonly onAdded: (result: AddAssignmentsResult) => void;
}): ReactNode {
  const [saving, setSaving] = useState(false);

  const key = props.host.roles
    .flatMap((group) => group.choices.map((choice) => choice.roleId))
    .join();

  return (
    <Sheet
      open={props.open}
      onOpenChange={(next) => {
        if (!next && !saving) props.onClose();
      }}
    >
      <SheetContent showCloseButton={false}>
        <SheetTitle className="sr-only">Add assignment</SheetTitle>
        {props.open ? (
          <AddAssignmentForm
            key={key}
            to={{ search: props.search, selfId: props.selfId }}
            roles={props.host.roles}
            onSearchRecords={props.host.onSearchRecords}
            onCancel={props.onClose}
            onSubmit={async (input) => {
              setSaving(true);

              try {
                const result = await props.host.onSubmit(input);

                props.onClose();
                props.onAdded(result);
              } finally {
                setSaving(false);
              }
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
