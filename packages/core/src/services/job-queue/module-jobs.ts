import { omit } from "es-toolkit";

import type { JobDeclaration } from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import type { RequestPrincipal } from "../authorization/index.ts";
import { type JobData, JOB_STARTER_KEY, sendAsStarter } from "./index.ts";

// The worker builds the job principal from this key; `enqueueJob` is the only writer.
export { JOB_STARTER_KEY };

/** The pg-boss queue and send options a declaration's retry policy maps to. */
export type JobRetryOptions = {
  readonly retryLimit: number;
  readonly retryDelay: number;
  readonly retryBackoff: boolean;
};

/** A fetched payload without the starter key, and the starter it named. */
export type JobStarterSplit = {
  readonly data: JobData | null;
  readonly startedBy: string | undefined;
};

/** The pg-boss retry options of a declaration. Without `retry`, pg-boss's documented defaults. */
export function jobRetryOptions(
  job: Pick<JobDeclaration, "retry">
): JobRetryOptions {
  return {
    retryLimit: job.retry?.limit ?? 2,
    retryDelay: job.retry?.delaySeconds ?? 0,
    retryBackoff: job.retry?.backoff ?? false,
  };
}

/**
 * Enqueues one run of a module job, started by the caller when the caller is signed in. The job
 * carries the declaration's retry policy, so a queue created before the worker updated it still
 * retries by the declaration.
 */
export async function enqueueJob<TData extends JobData>(
  ctx: { readonly tenant: TenantContext; readonly caller?: RequestPrincipal },
  job: JobDeclaration<TData>,
  data: TData
): Promise<string | null> {
  const payload: JobData = omit(data, [JOB_STARTER_KEY]);

  return sendAsStarter(
    ctx.tenant.jobQueue,
    job.name,
    ctx.caller?.authenticated === true
      ? { ...payload, [JOB_STARTER_KEY]: ctx.caller.userId }
      : payload,
    jobRetryOptions(job)
  );
}

/** Splits the starter off a fetched payload. A payload without the key is answered unchanged. */
export function splitJobStarter(data: JobData | null): JobStarterSplit {
  if (data === null || !(JOB_STARTER_KEY in data)) {
    return { data, startedBy: undefined };
  }

  const startedBy = data[JOB_STARTER_KEY];

  return {
    data: omit(data, [JOB_STARTER_KEY]),
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the job data is a json boundary.
    startedBy: typeof startedBy === "string" ? startedBy : undefined,
  };
}
