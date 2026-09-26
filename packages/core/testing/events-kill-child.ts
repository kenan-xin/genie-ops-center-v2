import {
  createTenantContext,
  type TenantContext,
} from "../src/lib/tenant-context/index.ts";
import {
  type TenantTransaction,
  withTransaction,
} from "../src/lib/tenant-context/with-transaction.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import { killCaseContract, killCaseModule } from "./events-kill-module.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- child setup and commit path stay together. */

const databaseUrl = process.env.DATABASE_URL;
const eventId = process.env.EVENT_ID;
const eventLabel = process.env.EVENT_LABEL;
if (
  databaseUrl === undefined ||
  eventId === undefined ||
  eventLabel === undefined
) {
  throw new Error("the event kill fixture needs database and event values");
}

const source = {
  DATABASE_URL: databaseUrl,
  PUBLIC_URL: "https://test.example.invalid",
};
const context = createTenantContext(source, silentLogger(), ["event-kill"]);
// SAFETY: this isolated child exercises the core API added by this ticket before any worker starts.
const core =
  (await import("../src/index.ts")) as typeof import("../src/index.ts") & {
    registerModuleRuntime?: (
      target: TenantContext,
      modules: readonly (typeof killCaseModule)[]
    ) => void | Promise<void>;
  };

if (core.registerModuleRuntime === undefined) {
  throw new Error("registerModuleRuntime is not available yet");
}

await core.registerModuleRuntime(context, [killCaseModule]);
await withTransaction(context, async (tx, afterCommit) => {
  // SAFETY: the event bus is registered from the same module list immediately above.
  const events = (
    context as TenantContext & {
      readonly events: {
        emit<T>(
          tx: TenantTransaction,
          event: typeof killCaseContract,
          payload: T
        ): Promise<void>;
      };
    }
  ).events;

  await events.emit(tx, killCaseContract, {
    id: eventId,
    label: eventLabel,
  });
  afterCommit(() => {
    process.kill(process.pid, "SIGKILL");
  });
});
