import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { createTenantContext } from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import {
  DemoSeedRefused,
  planDemoAccess,
  seedDemoAccess,
} from "@genie/core/testing";
import {
  type DemoHistoryPlan,
  demoReportingDate,
  planDemoHistory,
  seedDemoHistory,
} from "@genie/module-invoices/testing";

/**
 * Loads the demo pack history and the demo account's access into one deployment (R-59): every
 * role of the demo tenant's modules granted tenant-wide to the demo account, the reporting date,
 * the history PDFs through FileStorage and the history through the module procedures. It prints
 * what it will write before it writes, and a second run writes nothing. The revert is a
 * `pg_dump` taken before the run (`docs/modules/invoices-and-payments/README.md`, "Demo seed").
 *
 * Usage: DATABASE_URL=... DEMO_ACCOUNT_EMAIL=... node testing/seed-demo.ts [--dry-run]
 */

/** Host, port and database of a connection string, never its user or password. */
export function targetLabel(databaseUrl: string): string {
  const url = new URL(databaseUrl);

  return `${url.host}${url.pathname}`;
}

const NO_HISTORY: DemoHistoryPlan = {
  documents: { toWrite: 0, present: 0 },
  invoices: { toWrite: 0, present: 0 },
  payments: { toWrite: 0, present: 0 },
};

/** Plans, prints the plan as report lines, and writes it unless `dryRun` or nothing is missing. */
export async function seedDemo(input: {
  readonly databaseUrl: string;
  readonly email: string;
  readonly moduleIds: readonly string[];
  readonly dryRun: boolean;
}): Promise<readonly string[]> {
  const context = createTenantContext(
    { DATABASE_URL: input.databaseUrl, PUBLIC_URL: "http://localhost" },
    silentLogger(),
    input.moduleIds,
    undefined,
    "core"
  );

  try {
    const withHistory = input.moduleIds.includes("invoices");

    const history = withHistory ? await planDemoHistory(context) : NO_HISTORY;

    const accessInput = {
      email: input.email,
      moduleIds: input.moduleIds,
      reportingDate: demoReportingDate(),
    };

    const access = await planDemoAccess(context, accessInput);

    const { roles, reportingDate } = access;

    const lines = [
      `Demo seed for ${targetLabel(input.databaseUrl)}`,
      `Demo account: user ${access.userId}`,
      `Modules: ${input.moduleIds.join(", ")}`,
      `1. Role assignments for the demo account: ${roles.toGrant.length} to write, ${roles.present.length} already present (${[...roles.toGrant, ...roles.present].toSorted().join(", ")})`,
      reportingDate.from === reportingDate.to
        ? `2. Reporting date: ${reportingDate.to}, already set`
        : `2. Reporting date: ${reportingDate.from ?? "blank"} -> ${reportingDate.to}`,
      `3. History PDFs through FileStorage: ${history.documents.toWrite} to write, ${history.documents.present} already present (file, file_blob and document rows)`,
      `4. Demo pack history: ${history.invoices.toWrite} invoices and ${history.payments.toWrite} payments to write, ${history.invoices.present} and ${history.payments.present} already present (customer, invoice, payment, allocation, allocation_event and audit_event rows)`,
    ];

    const nothingToWrite =
      roles.toGrant.length === 0 &&
      reportingDate.from === reportingDate.to &&
      history.documents.toWrite === 0 &&
      history.invoices.toWrite === 0 &&
      history.payments.toWrite === 0;

    if (input.dryRun) return [...lines, "Dry run: nothing written."];

    if (nothingToWrite) return [...lines, "Already seeded: nothing to write."];

    await seedDemoAccess(context, accessInput);

    if (withHistory) {
      await seedDemoHistory(context, { userId: access.userId });
    }

    return [...lines, "Written."];
  } finally {
    await context.db.$client.end();
  }
}

if (import.meta.main) {
  const usage =
    "usage: DATABASE_URL=<url> DEMO_ACCOUNT_EMAIL=<address> node testing/seed-demo.ts [--dry-run]";

  let dryRun = false;

  try {
    dryRun =
      parseArgs({ options: { "dry-run": { type: "boolean" } } }).values[
        "dry-run"
      ] === true;
  } catch {
    console.error(usage);
    process.exit(2);
  }

  // Read from the environment only; the operator chooses the env file (`node --env-file=...`).
  const { DATABASE_URL, DEMO_ACCOUNT_EMAIL } = process.env;

  if (!DATABASE_URL || !DEMO_ACCOUNT_EMAIL) {
    console.error(usage);
    process.exit(2);
  }

  try {
    const lines = await seedDemo({
      databaseUrl: DATABASE_URL,
      email: DEMO_ACCOUNT_EMAIL,
      // Read as `readModulesFile` reads it; the boundary rules keep `@genie/generators` out of
      // the app's testing folder (R-7a).
      moduleIds: readFileSync(
        resolve(
          import.meta.dirname,
          "../../../customers/genie-demo/deploy/modules.txt"
        ),
        "utf8"
      )
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
      dryRun,
    });

    console.log(lines.join("\n"));
  } catch (error) {
    if (!(error instanceof DemoSeedRefused)) throw error;

    console.error(`Refused: ${error.message}`);
    process.exit(1);
  }
}
