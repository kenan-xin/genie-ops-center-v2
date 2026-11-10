import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { createTenantContext } from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import {
  DemoSeedRefused,
  modelsDiffer,
  planDemoAccess,
  seedDemoAccess,
} from "@genie/core/testing";
import {
  planDashboardSeed,
  seedDashboard,
} from "@genie/module-analytics/testing";
import {
  type DemoHistoryPlan,
  demoReportingDate,
  planDemoHistory,
  seedDemoHistory,
} from "@genie/module-invoices/testing";

import { RECEIVABLES_OVERVIEW } from "./receivables-overview.ts";

/**
 * The recommended defaults of the committed S7-14 report (`docs/modules/invoices-and-payments/evaluation/report.md`, AC-11),
 * with Opus still allowed so that a person can pick it per chat (`czjw.97`).
 */
const DEMO_MODELS = {
  chat: "openai/gpt-6.1-terra",
  document: "openai/gpt-6.1-terra",
  allowed: ["anthropic/claude-opus-5.5"],
};

/** The one role per module that the demo account gets: each module's editor role (R-59, `czjw.99`). */
const DEMO_ROLES = new Map([
  ["invoices", "Invoices and Payments editor"],
  ["analytics", "Analytics editor"],
  ["slides", "Slides editor"],
]);

/**
 * Loads the demo pack history and the demo account's access into one deployment (R-59): one role
 * per module of the demo tenant and `Ask user`, granted tenant-wide to the demo account, with the
 * extra roles that an earlier seed granted removed, the reporting date,
 * the evaluated model connection, the history PDFs through FileStorage, the history through the module procedures and, with
 * analytics, the Receivables overview starter dashboard. It prints
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
  readings: { toWrite: 0, present: 0 },
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
      roles: input.moduleIds.map((moduleId) => {
        const name = DEMO_ROLES.get(moduleId);

        if (name === undefined) {
          throw new DemoSeedRefused(
            `no demo role is named for the ${moduleId} module. Add one to DEMO_ROLES in testing/seed-demo.ts.`
          );
        }

        return name;
      }),
      reportingDate: demoReportingDate(),
      models: DEMO_MODELS,
    };

    const access = await planDemoAccess(context, accessInput);

    const { roles, reportingDate, models } = access;
    const addedModels = models.to.allowed.length - models.from.allowed.length;

    // The starter reads invoices datasets, so it needs both modules (R-51).
    const withStarter =
      input.moduleIds.includes("analytics") &&
      input.moduleIds.includes("invoices");

    const starterInput = {
      ownerUserId: access.userId,
      name: RECEIVABLES_OVERVIEW.name,
    };

    const starter = withStarter
      ? await planDashboardSeed(context, starterInput)
      : { toWrite: 0, present: 0 };

    const lines = [
      `Demo seed for ${targetLabel(input.databaseUrl)}`,
      `Demo account: user ${access.userId}`,
      `Modules: ${input.moduleIds.join(", ")}`,
      `1. Role assignments for the demo account: ${roles.toGrant.length} to write, ${roles.present.length} already present, ${roles.toRemove.length} to remove (${[...roles.toGrant, ...roles.present].toSorted().join(", ")}${roles.toRemove.length === 0 ? "" : `; removes ${[...roles.toRemove].toSorted().join(", ")}`})`,
      reportingDate.from === reportingDate.to
        ? `2. Reporting date: ${reportingDate.to}, already set`
        : `2. Reporting date: ${reportingDate.from ?? "blank"} -> ${reportingDate.to}`,
      modelsDiffer(access)
        ? `3. Model connection: chat ${models.from.chat ?? "blank"} -> ${models.to.chat}, document ${models.from.document ?? "blank"} -> ${models.to.document}, ${addedModels} allowed models to add`
        : `3. Model connection: chat ${models.to.chat} and document ${models.to.document}, already set`,
      `4. History PDFs through FileStorage: ${history.documents.toWrite} to write, ${history.documents.present} already present (file, file_blob and document rows), ${history.readings.toWrite} readings to store`,
      `5. Demo pack history: ${history.invoices.toWrite} invoices and ${history.payments.toWrite} payments to write, ${history.invoices.present} and ${history.payments.present} already present (customer, invoice, payment, allocation, allocation_event and audit_event rows)`,
      ...(withStarter
        ? [
            `6. Receivables overview starter dashboard: ${starter.toWrite} to write, ${starter.present} already present (dashboard row)`,
          ]
        : []),
    ];

    const nothingToWrite =
      roles.toGrant.length === 0 &&
      roles.toRemove.length === 0 &&
      reportingDate.from === reportingDate.to &&
      !modelsDiffer(access) &&
      history.documents.toWrite === 0 &&
      history.invoices.toWrite === 0 &&
      history.payments.toWrite === 0 &&
      history.readings.toWrite === 0 &&
      starter.toWrite === 0;

    if (input.dryRun) return [...lines, "Dry run: nothing written."];

    if (nothingToWrite) return [...lines, "Already seeded: nothing to write."];

    await seedDemoAccess(context, accessInput);

    if (withHistory) {
      await seedDemoHistory(context, { userId: access.userId });
    }

    if (withStarter) {
      await seedDashboard(context, {
        ...starterInput,
        config: RECEIVABLES_OVERVIEW.config,
      });
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
