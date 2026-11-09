import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { gatedArea } from "../../lib/rpc/implement-core-area.ts";
import { ASK_PERMISSION } from "../authorization/roles.ts";
import { checkChart } from "../charts/index.ts";
import { listOwnArtifacts } from "./artifacts.ts";
import { agentContract } from "./contract.ts";
import { listOwnFiles, ownFileLink } from "./files.ts";
import { withRecordPaths } from "./record-paths.ts";
import { retryRun } from "./run-job.ts";
import { stopRun } from "./runs.ts";
import {
  deleteOwnSession,
  listOwnSessions,
  readOwnSession,
  readOwnSessionDetail,
  renameOwnSession,
} from "./store.ts";

// The session check and the `core:ask:use` gate run before input is parsed, so a person without
// the key is refused `forbidden` before any read, whatever the config (R-42, DEC-39). The
// break-glass account bypasses `can()`, so it is refused here as `agentAccess` refuses it (P7).
const os = gatedArea(agentContract, ASK_PERMISSION).use(
  async ({ context, next }) => {
    if ((await context.caller.grants()).bypass === true) {
      throw new AppError(CORE_ERRORS.forbidden);
    }

    return next();
  }
);

/**
 * The `agent` area, mounted by the application under `agent`: the caller's own sessions, and a
 * chart of an answer drawn through the S7-04 gate as the viewer (R-45), whose records table opens
 * each row's record (R-44).
 */
export function createAgentRouter() {
  return os.router({
    sessions: os.sessions.handler(({ context, input }) =>
      listOwnSessions(context, input)
    ),
    session: os.session.handler(({ context, input }) =>
      readOwnSessionDetail(context, input.id)
    ),
    stop: os.stop.handler(({ context, input }) => stopRun(context, input.id)),
    retry: os.retry.handler(({ context, input }) =>
      retryRun(context, input.id)
    ),
    // A rename or a delete of a missing chat, or of another person's, is `not-found`, not empty.
    rename: os.rename.handler(({ context, input }) =>
      renameOwnSession(context, input.id, input.title)
    ),
    remove: os.remove.handler(({ context, input }) =>
      deleteOwnSession(context, input.id)
    ),
    // A chat the bubble opened but never sent is not saved yet, and another person's id reads
    // the same way, so both answer no messages.
    messages: os.messages.handler(async ({ context, input }) => {
      try {
        return (await readOwnSession(context, input.id)).messages;
      } catch (cause) {
        if (cause instanceof AppError && cause.code === "not-found") return [];

        throw cause;
      }
    }),
    // A malformed id reads as not found, and answers no artifacts, as `messages` does.
    artifacts: os.artifacts.handler(async ({ context, input }) => {
      try {
        return await listOwnArtifacts(context, input.id);
      } catch (cause) {
        if (cause instanceof AppError && cause.code === "not-found") return [];

        throw cause;
      }
    }),
    // A malformed id or another person's chat answers no files, as `artifacts` does.
    files: os.files.handler(async ({ context, input }) => {
      try {
        return await listOwnFiles(context, input.id);
      } catch (cause) {
        if (cause instanceof AppError && cause.code === "not-found") return [];

        throw cause;
      }
    }),
    fileLink: os.fileLink.handler(async ({ context, input }) =>
      ownFileLink(context, input.id)
    ),
    chart: os.chart.handler(async ({ context, input }) =>
      withRecordPaths(context, await checkChart(context, input.config))
    ),
  });
}

export type AgentRouter = ReturnType<typeof createAgentRouter>;
