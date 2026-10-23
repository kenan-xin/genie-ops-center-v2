import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { withTransaction } from "../src/index.ts";
import { validModule } from "../src/lib/module-contract/__fixtures__/valid-module.ts";
import { TENANT_ADMINISTRATOR_ROLE } from "../src/lib/module-contract/system-roles.ts";
import { tenantBranding } from "../src/schema.ts";
import {
  principalFor,
  seedRoles,
} from "../src/services/authorization/index.ts";
import { loadShell, type ShellLabels } from "../src/services/shell/index.ts";
import {
  assignRole,
  type DisposableDeployment,
  enableModules,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
} from "./index.ts";

/**
 * The shell model (Spec 3 R-27, R-30, R-32, R-39) against a real Postgres: real role assignments
 * through the one permission pass, and a real branding row naming a stored mark.
 */
const modules = [validModule];

const labels: ShellLabels = {
  coreEntries: {},
  coreGroups: {
    "people-and-access": "People and access",
    "tenant": "Tenant",
    "catalog": "Catalog",
  },
};

let deployment: DisposableDeployment;

beforeAll(async () => {
  deployment = await startDisposableDeployment(modules);
  await enableModules(deployment.context, ["fixture"]);
  await seedRoles(deployment.context, modules);
  await markSetupDone(deployment.context);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

afterEach(() => {
  vi.useRealTimers();
});

function shellFor(userId: string) {
  const tenant = deployment.context;

  return loadShell({
    tenant,
    modules,
    caller: principalFor({ tenant, modules, userId, authenticated: true }),
    labels,
  });
}

/** The branding reader caches for ten seconds; each write moves the clock further past it. */
let clockShift = 0;

async function brandingNames(markFileId: string | null): Promise<void> {
  await deployment.context.db
    .update(tenantBranding)
    .set({ logoMarkFileId: markFileId });
  clockShift += 60_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + clockShift);
}

describe("loadShell against a real database", () => {
  it("a signed-in member with no grants sees no navigation and is no administrator", async () => {
    const shell = await shellFor(await insertUser(deployment.context));

    expect(shell.isAdministrator).toBe(false);
    expect(shell.adminHome).toBeUndefined();
    expect(shell.landing).toBeUndefined();
    expect(shell.navigation).toEqual({
      pinned: [],
      workspace: [],
      categories: [],
      admin: [],
    });
  });

  it("a Tenant administrator lands on People and sees the core groups in order", async () => {
    const userId = await insertUser(deployment.context);

    const { rows } = await deployment.context.db.$client.query(
      "select id from role where name = $1",
      [TENANT_ADMINISTRATOR_ROLE]
    );

    await assignRole(deployment.context, {
      roleId: String(rows[0]?.id),
      principal: { type: "user", id: userId },
    });

    const shell = await shellFor(userId);

    expect(shell.isAdministrator).toBe(true);
    expect(shell.adminHome).toBe("/admin/people");
    expect(
      shell.navigation.admin.slice(0, 3).map((group) => group.label)
    ).toEqual(["People and access", "Tenant", "Catalog"]);
    expect(JSON.stringify(shell)).not.toContain("core:people:manage");
  });

  it("links a skipped-scan mark that branding names, and none without one", async () => {
    const { context } = deployment;
    const userId = await insertUser(context);

    const markId = await withTransaction(
      context,
      async (tx) =>
        (
          await context.fileStorage.store(
            {
              fileName: "mark.png",
              mimeType: "image/png",
              bytes: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=",
                "base64"
              ),
              uploadedByUserId: null,
            },
            tx
          )
        ).id
    );

    await brandingNames(markId);
    expect((await shellFor(userId)).identity.markUrl).toContain(
      "/api/files/download?token="
    );

    await brandingNames(null);
    expect((await shellFor(userId)).identity.markUrl).toBeNull();
  });
});
