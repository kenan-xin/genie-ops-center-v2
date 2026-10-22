"use client";

import * as React from "react";

import { Button } from "../components/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/dialog.tsx";

export type ConfirmDialogProps = {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly danger: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
};

// Escape, the scrim and Cancel are one cancel. Confirm leaves `open` to the caller.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent showCloseButton={false} initialFocus={cancelRef}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelRef} variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
