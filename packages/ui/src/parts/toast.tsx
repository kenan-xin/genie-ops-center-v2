"use client";

import { CircleAlertIcon, CircleCheckIcon, XIcon } from "lucide-react";
import { toast as sonner } from "sonner";

import { Button } from "../components/button.tsx";

export type ToastTone = "neutral" | "success" | "error";

type ToastInput = {
  readonly tone?: ToastTone;
  readonly title: string;
  readonly description?: string;
};

// Sonner gives a toast no role, so each one renders as a status card (R-24).
export function toast({
  tone = "neutral",
  title,
  description,
}: ToastInput): string | number {
  return sonner.custom((id) => (
    <div
      role="status"
      className="flex w-89 max-w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-foreground"
    >
      {tone === "success" ? (
        <CircleCheckIcon
          aria-hidden="true"
          className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
        />
      ) : null}
      {tone === "error" ? (
        <CircleAlertIcon
          aria-hidden="true"
          className="size-5 shrink-0 text-destructive dark:text-destructive-on-dark"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {description === undefined ? null : (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        onClick={() => sonner.dismiss(id)}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  ));
}
