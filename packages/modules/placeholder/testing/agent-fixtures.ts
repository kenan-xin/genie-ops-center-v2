import type { TenantContext } from "@genie/core";

import { insertPlaceholderRecord } from "./factories.ts";

/** Three fictional records with fixed ids, so the agent tests and the recordings agree on them. */
export const AGENT_RECORDS = [
  {
    id: "00000000-0000-4000-8000-0000000000a1",
    label: "Alpha",
    recordedOn: "2026-01-05",
    amountCents: 120000,
    currency: "SGD",
    quantity: 2,
  },
  {
    id: "00000000-0000-4000-8000-0000000000a2",
    label: "Bravo",
    recordedOn: "2026-02-10",
    amountCents: 80000,
    currency: "SGD",
    quantity: 1,
  },
  {
    id: "00000000-0000-4000-8000-0000000000a3",
    label: "Charlie",
    recordedOn: "2026-03-15",
    amountCents: 50000,
    currency: "SGD",
    quantity: 4,
  },
] as const;

/** Writes the three agent records through the module's own factory. */
export async function insertAgentRecords(tenant: TenantContext): Promise<void> {
  await Promise.all(
    AGENT_RECORDS.map((record) => insertPlaceholderRecord(tenant, record))
  );
}
