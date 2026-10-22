import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { group, groupMember, user } from "../src/schema.ts";
import {
  ADMIN_ADD_BREAK_GLASS,
  ADMIN_ADD_DISABLED,
  ADMIN_ADD_ERASED,
} from "../src/services/administrators/index.ts";
import {
  GENIE_ADMINISTRATORS_GROUP,
  seedGenieAdministrators,
  seedRoles,
} from "../src/services/authorization/index.ts";
import { runGenieOps } from "../src/services/ops/index.ts";
import {
  type DisposableDeployment,
  insertUser,
  startDisposableDeployment,
} from "./index.ts";

type AuditRow = {
  actor_user_id: string | null;
  action: string;
  metadata: unknown;
};

/** A real Postgres with the `Genie Administrators` group the `roles` step seeds. */
async function administratorsDeployment(): Promise<DisposableDeployment> {
  const deployment = await startDisposableDeployment();

  await seedRoles(deployment.context, []);
  await seedGenieAdministrators(deployment.context);

  return deployment;
}

/** Runs `genie-ops admin add <address>` and returns its exit code and printed lines. */
async function adminAdd(context: TenantContext, address: string) {
  const lines: string[] = [];
  const output = (line: string) => lines.push(line);

  const code = await runGenieOps(["admin", "add", address], {
    source: {
      DATABASE_URL: context.env.databaseUrl,
      PUBLIC_URL: context.env.publicUrl,
    },
    compiledModules: [],
    histories: [],
    output,
    errorOutput: output,
  });

  return { code, text: lines.join("\n") };
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

async function auditRows(context: TenantContext): Promise<AuditRow[]> {
  const result = await context.db.$client.query<AuditRow>(
    "select actor_user_id, action, metadata from audit_event order by occurred_at, id"
  );

  return result.rows;
}

/** The audit rows a block of work wrote, on a database other cases share. */
async function auditRowsOf(
  context: TenantContext,
  work: () => Promise<void>
): Promise<AuditRow[]> {
  const before = (await auditRows(context)).length;

  await work();

  return (await auditRows(context)).slice(before);
}

async function membershipsOf(context: TenantContext, userId: string) {
  return context.db
    .select()
    .from(groupMember)
    .where(eq(groupMember.userId, userId));
}

/**
 * `genie-ops admin add` (R-59, AC-13): one write that pre-adds a pending person into
 * `Genie Administrators` or adds an existing person to it, no email, and exactly one
 * `ops:admin-add` audit row with the operating-system user and the non-secret argument.
 *
 * Every case but the missing-group one shares one deployment; each uses its own address.
 */
describe("genie-ops admin add", () => {
  let deployment: DisposableDeployment;
  let context: TenantContext;

  beforeAll(async () => {
    deployment = await administratorsDeployment();
    context = deployment.context;
  }, 120000);

  afterAll(async () => {
    await deployment?.stop();
  });

  it("pre-adds a pending person and writes exactly one audit row", async () => {
    const rows = await auditRowsOf(context, async () => {
      await expect(
        adminAdd(context, "New.Admin@Example.INVALID")
      ).resolves.toMatchObject({ code: 0 });
    });

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

    const memberships = await membershipsOf(context, person?.id ?? "");

    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      groupId: await administratorsGroup(context),
      source: "local",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: null,
      action: "ops:admin-add",
      metadata: {
        osUser: expect.any(String),
        // The audit row and the `user` row name the same lower-cased address (R-61).
        args: ["new.admin@example.invalid"],
        outcome: "success",
      },
    });
  });

  it("adds an existing person to the group without a second user row", async () => {
    const existingId = await insertUser(context, {
      name: "Existing",
      email: "existing@example.invalid",
      status: "active",
    });

    await expect(
      adminAdd(context, "Existing@Example.Invalid")
    ).resolves.toMatchObject({ code: 0 });

    await expect(membershipsOf(context, existingId)).resolves.toMatchObject([
      { groupId: await administratorsGroup(context), source: "local" },
    ]);

    const people = await context.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "existing@example.invalid"));

    expect(people).toHaveLength(1);
  });

  it("is idempotent: a second run changes no membership and writes one more row", async () => {
    const rows = await auditRowsOf(context, async () => {
      await expect(
        adminAdd(context, "twice@example.invalid")
      ).resolves.toMatchObject({ code: 0 });
      await expect(
        adminAdd(context, "twice@example.invalid")
      ).resolves.toMatchObject({ code: 0 });
    });

    const [person] = await context.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "twice@example.invalid"));

    await expect(
      membershipsOf(context, person?.id ?? "")
    ).resolves.toHaveLength(1);
    expect(rows.filter((row) => row.action === "ops:admin-add")).toHaveLength(
      2
    );
  });

  it.each([
    ["the break-glass account", { isBreakGlass: true }, ADMIN_ADD_BREAK_GLASS],
    [
      "a banned person, naming the way back",
      { banned: true },
      ADMIN_ADD_DISABLED,
    ],
    ["an erased person", { erasedAt: new Date() }, ADMIN_ADD_ERASED],
  ] as const)(
    "refuses %s with a named cause, no membership and a failing row",
    async (who, flags, cause) => {
      const email = `refused-${who.split(" ").at(-1)}@example.invalid`;

      const userId = await insertUser(context, {
        email,
        status: "active",
        ...flags,
      });

      let text = "";

      const rows = await auditRowsOf(context, async () => {
        const result = await adminAdd(context, email);

        expect(result.code).not.toBe(0);
        text = result.text;
      });

      expect(text).toContain(cause);
      await expect(membershipsOf(context, userId)).resolves.toHaveLength(0);
      expect(rows.at(-1)).toMatchObject({
        action: "ops:admin-add",
        metadata: { outcome: "failure" },
      });
    }
  );

  it("refuses an address that is not an email before any audit row", async () => {
    const rows = await auditRowsOf(context, async () => {
      await expect(
        adminAdd(context, "not-an-email")
      ).resolves.not.toMatchObject({
        code: 0,
      });
    });

    expect(rows.filter((row) => row.action === "ops:admin-add")).toHaveLength(
      0
    );
  });

  // Its own deployment, because it deletes the group every other case needs.
  it("refuses when the administrators group is missing and writes a failing row", async () => {
    const own = await administratorsDeployment();

    try {
      await own.context.db
        .delete(group)
        .where(eq(group.name, GENIE_ADMINISTRATORS_GROUP));

      const result = await adminAdd(own.context, "late@example.invalid");

      expect(result.code).not.toBe(0);
      expect((await auditRows(own.context)).at(-1)).toMatchObject({
        action: "ops:admin-add",
        metadata: { outcome: "failure" },
      });
    } finally {
      await own.stop();
    }
  }, 120000);
});
