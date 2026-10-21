import { randomUUID } from "node:crypto";

/** One id per request, shared by the log line and the error body (R-44, R-46). */
export function newRequestId(): string {
  return randomUUID();
}
