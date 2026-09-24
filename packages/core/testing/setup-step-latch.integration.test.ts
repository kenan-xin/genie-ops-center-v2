import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { runGenieOps } from "../src/services/ops/index.ts";
import { startDisposablePostgres } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("the setup gate latch", () => {
  it("keeps every completed setup step done after a setup rerun", async () => {
    const postgres = await startDisposablePostgres();
    const observer = new Client({ connectionString: postgres.url });
    const files = await mkdtemp(join(tmpdir(), "genie-setup-latch-"));

    cleanups.push(async () => {
      await observer.end();
      await postgres.stop();
      await rm(files, { recursive: true, force: true });
    });

    await observer.connect();

    const tenantConfig = join(files, "tenant.yaml");
    const brandingSeed = join(files, "branding.seed.json");

    await writeFile(
      tenantConfig,
      [
        "modules: []",
        'onboarding_mode: "invite"',
        "local_accounts: false",
        "first_administrators:",
        "  - admin@example.invalid",
        "break_glass_email: break-glass@example.invalid",
        "",
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      brandingSeed,
      JSON.stringify({
        $schema: "../../deploy/schemas/branding.seed.schema.json",
        company_name: "Example",
        product_name: "Genie Ops Center",
        default_locale: "en",
        default_time_zone: "UTC",
      }),
      "utf8"
    );

    const output: string[] = [];

    const options = {
      source: {
        DATABASE_URL: postgres.url,
        PUBLIC_URL: "https://test.example.invalid",
      },
      compiledModuleIds: [],
      histories: [],
      output: (line: string) => output.push(line),
      errorOutput: (line: string) => output.push(line),
    };

    const args = [
      "setup",
      "--tenant-config",
      tenantConfig,
      "--branding-seed",
      brandingSeed,
    ];

    await expect(runGenieOps(args, options)).resolves.toBe(0);

    const afterFirst = await observer.query<{ step: string; state: string }>(
      "select step, state from setup_step order by step"
    );

    const completedSteps = afterFirst.rows
      .filter(({ state }) => state === "done")
      .map(({ step }) => step);

    expect(completedSteps).toEqual(["migrations", "seed"]);

    await expect(runGenieOps(args, options)).resolves.toBe(0);

    const afterRerun = await observer.query<{ step: string; state: string }>(
      "select step, state from setup_step order by step"
    );

    const stateAfterRerun = new Map(
      afterRerun.rows.map(({ step, state }) => [step, state])
    );

    for (const step of completedSteps) {
      expect(stateAfterRerun.get(step), `${step} after setup rerun`).toBe(
        "done"
      );
    }
  }, 120000);
});
