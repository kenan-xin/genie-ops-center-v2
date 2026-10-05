import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { group, groupMember, user } from "../src/schema.ts";
import {
  GENIE_ADMINISTRATORS_GROUP,
  seedGenieAdministrators,
  seedRoles,
} from "../src/services/authorization/index.ts";
import { runGenieOps } from "../src/services/ops/index.ts";
import { insertUser, startDisposableDeployment } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

type Fixture = {
  readonly context: TenantContext;
  readonly source: { DATABASE_URL: string; PUBLIC_URL: string };
  readonly output: (line: string) => void;
  readonly errorOutput: (line: string) => void;
  readonly lines: string[];
};

/** A real Postgres with the `Genie Administrators` group the `roles` step seeds. */
async function fixture(): Promise<Fixture> {
  const deployment = await startDisposableDeployment();

  cleanups.push(deployment.stop);

  await seedRoles(deployment.context, []);
  await seedGenieAdministrators(deployment.context);

  const lines: string[] = [];
  const output = (line: string) => lines.push(line);

  return {
    context: deployment.context,
    source: {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    },
    output,
    errorOutput: output,
    lines,
  };
}

async function administratorsGroup(context: TenantContext): Promise<string> {
  const [row] = await context.db
    .select({ id: group.id })
    .from(group)
    .where(eq(group.name, GENIE_ADMINISTRATORS_GROUP))
    .limit(1);

  if (row === undefined) throw new Error("no Genie Administrators group");

  return row.id;
}

async function auditRows(
  context: TenantContext
): Promise<
  Array<{ actor_user_id: string | null; action: string; metadata: unknown }>
> {
  const result = await context.db.$client.query<{
    actor_user_id: string | null;
    action: string;
    metadata: unknown;
  }>(
    "select actor_user_id, action, metadata from audit_event order by occurred_at, id"
  );

  return result.rows;
}

/**
 * `genie-ops admin add` (R-59, AC-13): one write that pre-adds a pending person into
 * `Genie Administrators` or adds an existing person to it, no email, and exactly one
 * `ops:admin-add` audit row with the operating-system user and the non-secret argument.
 */
describe("genie-ops admin add", () => {
  it("pre-adds a pending person and writes exactly one audit row", async () => {
    const { context, source, output, errorOutput } = await fixture();

    await expect(
      runGenieOps(["admin", "add", "New.Admin@Example.INVALID"], {
        source,
        compiledModules: [],
        histories: [],
        output,
        errorOutput,
      })
    ).resolves.toBe(0);

    const [person] = await context.db
      .select()
      .from(user)
      .where(eq(user.email, "new.admin@example.invalid"));

    expect(person).toMatchObject({
      email: "new.admin@example.invalid",
      status: "pending",
      onboarding: "invited",
      isBreakGlass: false,
    });

    const groupId = await administratorsGroup(context);

    const memberships = await context.db
      .select()
      .from(groupMember)
      .where(eq(groupMember.userId, person?.id ?? ""));

    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      groupId,
      source: "local",
    });

    const rows = await auditRows(context);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: null,
      action: "ops:admin-add",
      metadata: {
        osUser: expect.any(String),
        args: ["New.Admin@Example.INVALID"],
        outcome: "success",
      },
    });
  }, 120000);

  it("adds an existing person to the group without a second user row", async () => {
    const { context, source, output, errorOutput } = await fixture();

    const existingId = await insertUser(context, {
      name: "Existing",
      email: "existing@example.invalid",
      status: "active",
    });

    await expect(
      runGenieOps(["admin", "add", "Existing@Example.Invalid"], {
        source,
        compiledModules: [],
        histories: [],
        output,
        errorOutput,
      })
    ).resolves.toBe(0);

    const groupId = await administratorsGroup(context);

    await expect(
      context.db
        .select()
        .from(groupMember)
        .where(eq(groupMember.userId, existingId))
    ).resolves.toMatchObject([{ groupId, source: "local" }]);

    const people = await context.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "existing@example.invalid"));

    expect(people).toHaveLength(1);
  }, 120000);

  it("is idempotent: a second run changes no membership and writes one more row", async () => {
    const { context, source, output, errorOutput } = await fixture();

    const options = {
      source,
      compiledModules: [],
      histories: [],
      output,
      errorOutput,
    };

    await expect(
      runGenieOps(["admin", "add", "twice@example.invalid"], options)
    ).resolves.toBe(0);
    await expect(
      runGenieOps(["admin", "add", "twice@example.invalid"], options)
    ).resolves.toBe(0);

    const [person] = await context.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "twice@example.invalid"));

    await expect(
      context.db
        .select()
        .from(groupMember)
        .where(eq(groupMember.userId, person?.id ?? ""))
    ).resolves.toHaveLength(1);

    const rows = await auditRows(context);
    const adminRows = rows.filter((row) => row.action === "ops:admin-add");

    expect(adminRows).toHaveLength(2);
  }, 120000);

  it("refuses when the administrators group is missing and writes a failing row", async () => {
    const { context, source, output, errorOutput } = await fixture();

    await context.db
      .delete(group)
      .where(eq(group.name, GENIE_ADMINISTRATORS_GROUP));

    await expect(
      runGenieOps(["admin", "add", "late@example.invalid"], {
        source,
        compiledModules: [],
        histories: [],
        output,
        errorOutput,
      })
    ).resolves.not.toBe(0);

    const rows = await auditRows(context);

    expect(rows.at(-1)).toMatchObject({
      action: "ops:admin-add",
      metadata: { outcome: "failure" },
    });
  }, 120000);
});
