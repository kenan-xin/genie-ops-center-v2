import { toast } from "@genie/ui";
import {
  type MutationObserverOptions,
  type QueryClient,
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation.js";
import { useEffect, useRef, useTransition } from "react";

import { type FailureKind, type Refusal, refusalOf } from "./client.ts";

/** Every admin write records an audit row, so its success says so. */
export const SAVED = "Saved. Written to the audit log.";

// A failure with no known cause, reported by a toast that names no form.
export const NOT_SAVED = "That change could not be saved. Try again.";

/** The catalogue's save-failure copy: one cause per kind, the rate-limit wait, the kept edit. */
export type SaveFailureCopy = {
  readonly causes: Readonly<Record<Exclude<FailureKind, "unknown">, string>>;
  readonly retryAfter: (minutes: number) => string;
  readonly kept: string;
};

/** A write that answers whether it changed a row: only a change wrote an audit row. */
export const savedIfChanged = (result: { readonly changed: boolean }) =>
  result.changed ? SAVED : undefined;

/** One admin write: the call, what it reloads, and how the route reports it. */
export type AdminWrite<TInput, TResult> = {
  readonly write: (input: TInput) => Promise<TResult>;
  /** The queries the write can change. They reload together after it, refused or not. */
  readonly invalidate: readonly QueryKey[];
  /** Reload the server-rendered navigation too, before the report; no client query holds it. */
  readonly refresh?: boolean;
  /** The success toast, or `undefined` for none. Default: SAVED. */
  readonly saved?: (result: TResult, input: TInput) => string | undefined;
  /** Shows a refusal in place of the error toast, for example under its field. */
  readonly refused?: (refusal: Refusal, input: TInput) => void;
  /**
   * The sentence that names what a form did not save, for example "The idle timeout was not
   * saved.". With it the refusal's message reads: that sentence, the cause, and that the edit is kept.
   */
  readonly notSaved?: (input: TInput) => string;
};

/**
 * The mutation options behind `useAdminWrite`. A refused write rejects with its `Refusal`, whose
 * message is the copy every form shows for that kind of failure, so a screen that awaits the write
 * reads the same message. The reload runs before the report, so a toast never names a save the
 * screen does not show yet.
 */
export function adminWriteOptions<TInput, TResult>(
  write: AdminWrite<TInput, TResult>,
  host: {
    readonly queryClient: QueryClient;
    /** Settles once the refreshed server tree is on screen. */
    readonly refresh: () => Promise<void>;
    readonly toast: typeof toast;
    readonly copy: SaveFailureCopy;
  }
): MutationObserverOptions<TResult, Refusal, TInput> {
  const { copy } = host;

  const messageOf = (refusal: Refusal, input: TInput): string => {
    const cause =
      refusal.message ||
      (refusal.kind === "unknown" ? "" : copy.causes[refusal.kind]);

    const reason = [
      cause,
      refusal.retryAfterMinutes === undefined
        ? ""
        : copy.retryAfter(refusal.retryAfterMinutes),
    ];

    if (write.notSaved === undefined)
      return reason.filter(Boolean).join(" ") || NOT_SAVED;

    return [write.notSaved(input), ...reason, copy.kept]
      .filter(Boolean)
      .join(" ");
  };

  // A read in flight left before the write answered, and an invalidation joins a first read rather
  // than starting another, so the reads are cancelled first and read again (xok3.32).
  const reload = async () => {
    await Promise.all(
      write.invalidate.map(async (queryKey) => {
        await host.queryClient.cancelQueries({ queryKey });
        await host.queryClient.invalidateQueries({ queryKey });
      })
    );

    if (write.refresh === true) await host.refresh();
  };

  return {
    mutationFn: async (input) => {
      try {
        return await write.write(input);
      } catch (cause) {
        const refusal = refusalOf(cause);

        throw { ...refusal, message: messageOf(refusal, input) };
      }
    },
    onSuccess: async (result, input) => {
      await reload();

      const title =
        write.saved === undefined ? SAVED : write.saved(result, input);

      if (title !== undefined) host.toast({ tone: "success", title });
    },
    onError: async (refusal, input) => {
      await reload();

      if (write.refused === undefined)
        host.toast({ tone: "error", title: refusal.message });
      else write.refused(refusal, input);
    },
  };
}

/**
 * Runs one admin write: the reload, then the Saved toast or the refusal. The server is the
 * authority for every change, so the client never edits its cache by hand.
 */
export function useAdminWrite<TInput, TResult>(
  write: AdminWrite<TInput, TResult>
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations("saveFailure");
  // Next sets its router state inside the caller's transition, so `refreshing` holds until the
  // refreshed tree commits. A report before that shows on a screen that the commit still changes,
  // and the commit takes the page title away for a moment (xok3.33).
  const [refreshing, startRefresh] = useTransition();
  const refreshed = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!refreshing) for (const settle of refreshed.current.splice(0)) settle();
  }, [refreshing]);

  return useMutation(
    adminWriteOptions(write, {
      queryClient,
      refresh: () =>
        new Promise<void>((settle) => {
          refreshed.current.push(settle);
          startRefresh(() => router.refresh());
        }),
      toast,
      copy: {
        causes: {
          network: t("network"),
          timeout: t("timeout"),
          refused: t("refused"),
          conflict: t("conflict"),
          invalid: t("invalid"),
        },
        retryAfter: (minutes) => t("retryAfter", { minutes }),
        kept: t("kept"),
      },
    })
  );
}
