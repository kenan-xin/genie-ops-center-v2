import { runWorker } from "@genie/core";

type WorkerStart = Pick<
  Parameters<typeof runWorker>[0],
  "source" | "modules" | "histories"
> & {
  /** How long the worker may take to say it started before the start fails. */
  readonly timeoutMs: number;
  /** Each line the worker writes, as it writes it. */
  readonly onLine?: (line: string) => void;
};

export type StartedWorker = {
  /** Aborts the job loops and waits for the run to stop pg-boss and close its pool. */
  readonly stop: () => Promise<void>;
};

/**
 * Starts the module job worker in this process, for the local dev app and the dev browser run:
 * `next dev` starts none, so without it every job stays queued (decision 14). Returns once the
 * worker says it started. A worker that ends first, or stays silent past `timeoutMs`, throws with
 * its own output lines.
 */
export async function startWorker(start: WorkerStart): Promise<StartedWorker> {
  const signal = new AbortController();
  const started = Promise.withResolvers<void>();
  const lines: string[] = [];

  const record = (line: string) => {
    lines.push(line);
    start.onLine?.(line);
  };

  const workerRun = runWorker({
    source: start.source,
    modules: start.modules,
    histories: start.histories,
    output: (line) => {
      record(line);

      if (line.includes("worker started")) started.resolve();
    },
    errorOutput: record,
    signal: signal.signal,
    shutdownTimeoutMs: 1000,
  });

  const stop = async () => {
    signal.abort();

    await workerRun.catch(() => undefined);
  };

  const bound = Promise.withResolvers<"late">();
  const timer = setTimeout(() => bound.resolve("late"), start.timeoutMs);

  const outcome = await Promise.race([
    started.promise.then(() => "started" as const),
    workerRun.then(
      () => "ended" as const,
      () => "ended" as const
    ),
    bound.promise,
  ]).finally(() => clearTimeout(timer));

  if (outcome === "started") return { stop };

  // Not awaited: the abort cannot cancel a pending pool connect, which waits out the pool's
  // connection timeout (LOCK_TIMEOUT_MS plus 5 s) before the run ends.
  signal.abort();

  throw new Error(
    `${outcome === "late" ? `The worker did not start within ${start.timeoutMs} ms.` : "The worker stopped before it started."}\n${lines.join("\n")}`
  );
}
