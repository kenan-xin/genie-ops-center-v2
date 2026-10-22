import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createJobQueue } from "../job-queue/index.ts";
import { silentLogger } from "../logging/index.ts";
import {
  createEventBus,
  durableEventQueues,
  registerSubscription,
} from "./index.ts";

// A pg pool is lazy: building one opens no connection, and registration never queries it.
const pool = new Pool({
  connectionString: "postgres://genie@db.invalid/genie",
});

function bus() {
  return createEventBus({
    jobQueue: createJobQueue(pool, silentLogger()),
    logger: silentLogger(),
    tenant: () => {
      throw new Error("registration never reads the tenant");
    },
  });
}

const contract = {
  name: "event-registration.record-touched",
  version: 1,
  payload: z.object({ id: z.string() }),
};

const archiveHandler = async () => {};

const notifyHandler = async () => {};

const byId = (payload: { id: string }) => payload.id;

function queueOf(
  entries: ReturnType<typeof durableEventQueues>,
  handler: () => Promise<void>
): string | undefined {
  return entries.find((entry) => entry.handler === handler)?.queue;
}

describe("event bus registration", () => {
  // Only a module's declared subscriptions are drained by the worker, so a direct durable or
  // serialized `on` would queue jobs nobody runs (R-53).
  it.each([
    { mode: "durable", options: { durable: true } },
    { mode: "serialized", options: { serializeBy: byId } },
  ])("refuses a direct $mode subscription", ({ options }) => {
    expect(() => bus().on(contract, async () => {}, options)).toThrow(
      'events.on("event-registration.record-touched") is fast only.'
    );
  });

  it("keeps a module subscription's queue name stable when same-mode subscriptions are reordered", () => {
    // `name` is the smallest stable identity a subscription can carry: a handler's identity does
    // not survive a rebuild, so the queue name must come from an explicit name (or the event
    // itself), never from the declaration index.
    const archive = {
      event: contract,
      name: "archive",
      serializeBy: byId,
      handler: archiveHandler,
    };

    const notify = {
      event: contract,
      name: "notify",
      serializeBy: byId,
      handler: notifyHandler,
    };

    const queuesFor = (order: readonly (typeof archive)[]) => {
      const built = bus();

      for (const subscription of order) {
        registerSubscription(built, "event-naming", subscription);
      }

      return durableEventQueues(built);
    };

    const declared = queuesFor([archive, notify]);
    const reordered = queuesFor([notify, archive]);

    expect(queueOf(declared, archiveHandler)).toBe(
      queueOf(reordered, archiveHandler)
    );
    expect(queueOf(declared, notifyHandler)).toBe(
      queueOf(reordered, notifyHandler)
    );
    expect(queueOf(declared, archiveHandler)).not.toBe(
      queueOf(declared, notifyHandler)
    );
  });

  it("refuses two subscriptions that resolve to one queue", () => {
    // Two unnamed durable subscriptions to one event fall back to one queue name.
    const unnamed = bus();

    registerSubscription(unnamed, "event-collision", {
      event: contract,
      durable: true,
      handler: archiveHandler,
    });
    expect(() =>
      registerSubscription(unnamed, "event-collision", {
        event: contract,
        durable: true,
        handler: notifyHandler,
      })
    ).toThrow(/already uses/);

    // A durable "fifo.x" and a serialized "x" both join to "....v1.fifo.x".
    const dotted = bus();

    registerSubscription(dotted, "event-collision", {
      event: contract,
      name: "fifo.x",
      durable: true,
      handler: archiveHandler,
    });
    expect(() =>
      registerSubscription(dotted, "event-collision", {
        event: contract,
        name: "x",
        serializeBy: byId,
        handler: notifyHandler,
      })
    ).toThrow(
      "event.event-collision.event-registration.record-touched.v1.fifo.x"
    );

    // A serialized "x.dead-letter" would drain the dead-letter queue of the serialized "x".
    const deadLetter = bus();

    registerSubscription(deadLetter, "event-collision", {
      event: contract,
      name: "x",
      serializeBy: byId,
      handler: archiveHandler,
    });
    expect(() =>
      registerSubscription(deadLetter, "event-collision", {
        event: contract,
        name: "x.dead-letter",
        serializeBy: byId,
        handler: notifyHandler,
      })
    ).toThrow(/already uses/);
  });
});
