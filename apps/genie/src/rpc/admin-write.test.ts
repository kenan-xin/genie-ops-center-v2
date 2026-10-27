import { ORPCError } from "@orpc/client";
import {
  MutationObserver,
  QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  type AdminWrite,
  adminWriteOptions,
  NOT_SAVED,
  SAVED,
} from "./admin-write.ts";
import type { Refusal } from "./client.ts";

const copy = {
  causes: {
    network: "The server could not be reached.",
    timeout: "The server did not answer in time.",
    refused: "You do not have permission.",
    conflict: "Someone else changed this.",
    invalid: "Some values are not valid.",
  },
  retryAfter: (minutes: number) => `Try again in ${minutes} minutes.`,
  kept: "Your change is kept.",
};

/** Runs one write through the real mutation lifecycle, as `useMutation` would. */
async function run<TResult>(write: AdminWrite<string, TResult>) {
  const queryClient = new QueryClient();
  const invalidated: (QueryKey | undefined)[] = [];
  const refresh = vi.fn();
  const toast = vi.fn();

  vi.spyOn(queryClient, "invalidateQueries").mockImplementation(
    async (filters) => {
      invalidated.push(filters?.queryKey);
    }
  );

  const outcome = await new MutationObserver(
    queryClient,
    adminWriteOptions(write, { queryClient, refresh, toast, copy })
  )
    .mutate("input")
    .then(
      (result) => ({ result }),
      (refusal: Refusal) => ({ refusal })
    );

  return { outcome, invalidated, refresh, toast };
}

const refused = new ORPCError("last-administrator", {
  status: 409,
  message: "The last administrator cannot be removed.",
  data: { appCode: "last-administrator", requestId: "req-1" },
});

describe("adminWriteOptions", () => {
  it("toasts the save after it reloads every given query and the navigation", async () => {
    const write = vi.fn(async (_input: string) => ({ changed: true }));

    const { outcome, invalidated, refresh, toast } = await run({
      write,
      invalidate: [["modules"], ["categories"]],
      refresh: true,
    });

    expect(write).toHaveBeenCalledWith("input");
    expect(outcome).toEqual({ result: { changed: true } });
    expect(invalidated).toEqual([["modules"], ["categories"]]);
    expect(refresh).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith({ tone: "success", title: SAVED });
  });

  it("reloads the given queries together, not one after the other", async () => {
    const queryClient = new QueryClient();
    const reloads = Promise.withResolvers<void>();

    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(() => reloads.promise);

    const done = new MutationObserver(
      queryClient,
      adminWriteOptions(
        {
          write: async () => undefined,
          invalidate: [["people"], ["person", "p-1"]],
        },
        { queryClient, refresh: vi.fn(), toast: vi.fn(), copy }
      )
    ).mutate("input");

    // A second reload that waited for the first would never start while the first is held.
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));

    reloads.resolve();

    await done;
  });

  it("lets the route name its own success toast, or none", async () => {
    const unchanged = await run({
      write: async () => ({ changed: false }),
      invalidate: [],
      saved: (result) => (result.changed ? SAVED : undefined),
    });

    expect(unchanged.toast).not.toHaveBeenCalled();

    const { refresh, toast } = await run({
      write: async () => ({ changed: true }),
      invalidate: [],
      saved: () => "Published",
    });

    expect(toast).toHaveBeenCalledWith({ tone: "success", title: "Published" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("toasts the server's safe message for a refusal and still reloads", async () => {
    const { outcome, invalidated, toast } = await run({
      write: () => Promise.reject(refused),
      invalidate: [["groups"]],
    });

    expect(outcome).toEqual({
      refusal: {
        kind: "conflict",
        message: "The last administrator cannot be removed.",
      },
    });
    expect(invalidated).toEqual([["groups"]]);
    expect(toast).toHaveBeenCalledWith({
      tone: "error",
      title: "The last administrator cannot be removed.",
    });
  });

  it("falls back to NOT_SAVED when the failure has no known cause", async () => {
    const { outcome, toast } = await run({
      write: () => Promise.reject(new ORPCError("INTERNAL_SERVER_ERROR")),
      invalidate: [],
    });

    expect(outcome).toEqual({
      refusal: { kind: "unknown", message: NOT_SAVED },
    });
    expect(toast).toHaveBeenCalledWith({ tone: "error", title: NOT_SAVED });
  });

  it("names what was not saved, the cause and that the edit is kept", async () => {
    const place = vi.fn();

    const { toast } = await run({
      write: () => Promise.reject(new TypeError("Failed to fetch")),
      invalidate: [],
      notSaved: (input) => `The ${input} was not saved.`,
      refused: place,
    });

    expect(place).toHaveBeenCalledWith(
      {
        kind: "network",
        message:
          "The input was not saved. The server could not be reached. Your change is kept.",
      },
      "input"
    );
    expect(toast).not.toHaveBeenCalled();
  });

  it("puts the rate-limit wait before the sentence that keeps the edit", async () => {
    const limited = new ORPCError("rate-limited", {
      status: 429,
      message: "Too many attempts.",
      data: {
        appCode: "rate-limited",
        requestId: "req-2",
        retryAfterMinutes: 3,
      },
    });

    const { outcome } = await run({
      write: () => Promise.reject(limited),
      invalidate: [],
      notSaved: () => "The person was not added.",
    });

    expect(outcome).toMatchObject({
      refusal: {
        message:
          "The person was not added. Too many attempts. Try again in 3 minutes. Your change is kept.",
      },
    });
  });
});
