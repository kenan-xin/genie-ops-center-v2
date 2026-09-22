import { createHash } from "node:crypto";

import type { ModuleNames } from "./render.ts";

type Template = (names: ModuleNames) => string;

/** What a rendered JSON file may hold. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonDocument;

type JsonDocument = { readonly [key: string]: JsonValue };

function json(value: JsonDocument): string {
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

/**
 * drizzle-kit stamps each snapshot with a fresh identifier. The generator has no
 * such freedom: the same id must render the same bytes, so the identifier is
 * derived from the module id instead of drawn at random.
 */
function snapshotId(id: string): string {
  const digest = createHash("sha256").update(id, "utf8").digest("hex");

  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `8${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

/** The one migration the generator writes. A later change adds the next tag. */
const FIRST_TAG = "0000_initial";

const manifest: Template = (names) =>
  json({
    name: names.packageName,
    version: "0.0.0",
    private: true,
    type: "module",
    exports: {
      ".": "./src/index.ts",
      "./presentation": "./src/presentation/index.ts",
      "./testing": "./testing/index.ts",
    },
    scripts: {
      "lint": "oxlint --config ../../../oxlint.config.ts src testing",
      "test": "vitest run",
      "test:integration": "vitest run --config vitest.integration.config.ts",
      "typecheck": "tsc --noEmit",
    },
    dependencies: {
      "@genie/core": "workspace:*",
      "@genie/ui": "workspace:*",
      "@trpc/server": "11.19.0",
      "drizzle-orm": "0.45.2",
      "react": "19.3.0",
      "zod": "4.6.5",
    },
    devDependencies: {
      "@genie/config": "workspace:*",
      "@storybook/nextjs-vite": "10.6.0",
      "@types/react": "19.3.0",
      "oxlint": "1.83.0",
      "storybook": "10.6.0",
      "vitest": "4.1.11",
    },
    genie: { module: { id: names.id, entrypoint: "src/index.ts" } },
    nx: { tags: ["module"] },
  });

const tsconfig: Template = () =>
  json({
    extends: "../../../tsconfig.base.json",
    compilerOptions: {
      jsx: "react-jsx",
      lib: ["ES2024", "DOM", "DOM.Iterable"],
    },
    include: [
      "src/**/*.ts",
      "src/**/*.tsx",
      "testing/**/*.ts",
      "vitest.config.ts",
      "vitest.integration.config.ts",
    ],
  });

const unitConfig: Template = () =>
  `import { unitTestPreset } from "@genie/config/vitest/unit";
import { defineConfig } from "vitest/config";

export default defineConfig(unitTestPreset);
`;

const integrationConfig: Template = () =>
  `import { defineConfig } from "vitest/config";

/**
 * The module's real-database tests. They live under \`testing/\`, which the unit preset
 * excludes on purpose, so they need this configuration to be discovered at all. Every test
 * here takes a disposable Postgres with the real migration histories applied; none mocks the
 * database (R-38).
 */
export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    include: ["testing/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    passWithNoTests: false,
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
`;

const drizzleConfig: Template = (names) =>
  `import { defineConfig } from "drizzle-kit";

/**
 * The migration history of this module. drizzle-kit writes the SQL file and the journal;
 * neither is edited by hand. The history and its table belong to the module alone (R-24).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  migrations: { table: "${names.migrationsTable}" },
});
`;

const firstMigration: Template = (names) =>
  `CREATE TABLE "${names.table}" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"category_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
`;

const journal: Template = () =>
  json({
    version: "7",
    dialect: "postgresql",
    entries: [
      {
        idx: 0,
        version: "7",
        // Fixed, so the same id renders the same bytes. drizzle-kit writes the
        // real timestamp on the next generated migration.
        when: 0,
        tag: FIRST_TAG,
        breakpoints: true,
      },
    ],
  });

const snapshot: Template = (names) =>
  json({
    id: snapshotId(names.id),
    prevId: "00000000-0000-0000-0000-000000000000",
    version: "7",
    dialect: "postgresql",
    tables: {
      [`public.${names.table}`]: {
        name: names.table,
        schema: "",
        columns: {
          id: {
            name: "id",
            type: "uuid",
            primaryKey: true,
            notNull: true,
            default: "gen_random_uuid()",
          },
          label: {
            name: "label",
            type: "text",
            primaryKey: false,
            notNull: true,
          },
          category_id: {
            name: "category_id",
            type: "text",
            primaryKey: false,
            notNull: false,
          },
          created_at: {
            name: "created_at",
            type: "timestamp with time zone",
            primaryKey: false,
            notNull: true,
            default: "now()",
          },
          updated_at: {
            name: "updated_at",
            type: "timestamp with time zone",
            primaryKey: false,
            notNull: true,
            default: "now()",
          },
        },
        indexes: {},
        foreignKeys: {},
        compositePrimaryKeys: {},
        uniqueConstraints: {},
        policies: {},
        checkConstraints: {},
        isRLSEnabled: false,
      },
    },
    enums: {},
    schemas: {},
    sequences: {},
    roles: {},
    policies: {},
    views: {},
    _meta: { columns: {}, schemas: {}, tables: {} },
  });

const schema: Template = (names) =>
  `import { migrationsFromJournal } from "@genie/core";
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import journal from "../drizzle/meta/_journal.json" with { type: "json" };

/**
 * The module's own table. A primary key is a UUID and an edited table carries both timestamps
 * (data-shape rules 4 and 5). The table belongs to this module: core never reads it, and it
 * exists only in an image that includes this module (DEC-33).
 */
export const ${names.camel}Record = pgTable("${names.table}", {
  id: uuid("id")
    .primaryKey()
    .default(sql\`gen_random_uuid()\`),
  label: text("label").notNull(),
  /** The core category this record sits under, or null for none (DEC-51). */
  categoryId: text("category_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** The module's own migration history table (R-24). */
export const MIGRATIONS_TABLE = "${names.migrationsTable}";

/**
 * Every SQL file the journal above names, one \`new URL\` each. This spelling is what puts the
 * SQL in the image: a production bundler follows a file reference written this way, emits the
 * file beside the server and rewrites the URL to the emitted copy, while a folder path is
 * followed by nothing and copied by nothing. A new migration adds its line here in the same
 * change that generates it, and \`migrationsFromJournal\` refuses to start if it does not.
 */
const MIGRATION_FILES = {
  "${FIRST_TAG}": new URL("../drizzle/${FIRST_TAG}.sql", import.meta.url),
};

/**
 * This module's migration history, in journal order (R-24).
 *
 * A thunk, not an array: the SQL read is deferred to the first call, because a page's SSR
 * compilation resolves the same SQL URL to a public asset path \`readFileSync\` cannot open, and
 * a module-scope read would fail that compilation. The \`new URL\` declarations above stay at
 * module scope on purpose: that spelling is what the bundler traces to copy the SQL into the
 * image, so this thunk defers only the read, never the URL declarations. Called once per
 * history at bootstrap.
 */
export const MIGRATIONS = () => migrationsFromJournal(journal, MIGRATION_FILES);
`;

const router: Template = (names) =>
  `import { can, type ModuleRequestContext } from "@genie/core";
import { TRPCError, initTRPC } from "@trpc/server";

import { ${names.camel}Record } from "./schema.ts";

const t = initTRPC.context<ModuleRequestContext>().create();

/**
 * The module's router, mounted under the module id when the module is enabled. Every procedure
 * checks \`can()\` first and reads only through \`ctx.tenant.db\` (DEC-34, DEC-39). The dot in the
 * path \`${names.id}.read\` is a tRPC path, not the permission key.
 */
export const ${names.camel}Router = t.router({
  read: t.procedure.query(async ({ ctx }) => {
    if (!(await can(ctx.caller, "${names.id}:read"))) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return ctx.tenant.db.select().from(${names.camel}Record);
  }),
});

export type ${names.pascal}Router = typeof ${names.camel}Router;
`;

const declaration: Template = (names) =>
  `import { can, type Module } from "@genie/core";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  ${names.pascal}AdminPage,
  ${names.pascal}WorkspacePage,
} from "./presentation/module-pages.tsx";
import { ${names.camel}Router } from "./router.ts";
import {
  MIGRATIONS,
  MIGRATIONS_TABLE,
  ${names.camel}Record,
} from "./schema.ts";

/**
 * The module's configuration, shown in central Settings behind \`core:settings:manage\`. Five
 * field kinds are allowed and no more (DEC-28).
 */
const configurationSchema = z.object({
  title: z.string().default("${names.displayName}"),
  pageSize: z.number().int().min(1).max(100).default(20),
});

const home = {
  id: "${names.id}-home",
  label: "${names.displayName}",
  path: "/${names.id}",
  surface: "workspace",
  requiredPermission: "${names.id}:use",
} as const;

const settings = {
  id: "${names.id}-settings",
  label: "${names.displayName} settings",
  path: "/admin/${names.id}",
  surface: "admin",
  requiredPermission: "${names.id}:admin",
} as const;

/**
 * Every point of the module contract this module declares. Nothing outside the contract is
 * reachable from here: the router reads through \`ctx.tenant\`, every check goes through
 * \`can()\`, and no other module is imported.
 */
export const ${names.camel}Module = {
  identity: {
    id: "${names.id}",
    displayName: "${names.displayName}",
    version: "0.0.0",
  },

  schema: {
    tables: { ${names.camel}Record },
    // The declaration, not its result: the SQL read is deferred to bootstrap.
    migrations: MIGRATIONS,
    migrationsTable: MIGRATIONS_TABLE,
  },

  router: ${names.camel}Router,

  permissions: [
    { key: "${names.id}:read", label: "Read ${names.displayName} records" },
    { key: "${names.id}:use", label: "Use the ${names.displayName} workspace" },
    { key: "${names.id}:admin", label: "Administer the ${names.displayName} module" },
  ],

  recordTypes: [
    {
      type: "${names.id}-record",
      resolve: async (id: string) => ({
        label: \`${names.displayName} record \${id}\`,
        path: \`/${names.id}/\${id}\`,
      }),
    },
  ],

  defaultRoles: [
    { name: "${names.displayName} user", permissions: ["${names.id}:use"] },
  ],

  navigation: {
    pinned: [home],
    entries: [home, settings],
  },

  pages: {
    workspace: { home: ${names.pascal}WorkspacePage },
    admin: { settings: ${names.pascal}AdminPage },
  },

  /**
   * The optional category contribution. Core owns the page and the category rows; this module
   * owns the reads and the writes against its own table, and checks its own permission on each
   * one (module contract, Category assignment boundary). Placement never grants access.
   */
  categoryAssignment: {
    listAssignable: async (ctx) => {
      if (!(await can(ctx.caller, "${names.id}:admin"))) {
        return [];
      }

      const rows = await ctx.tenant.db
        .select()
        .from(${names.camel}Record);

      return rows.map((row) => ({
        id: row.id,
        label: row.label,
        categoryId: row.categoryId ?? undefined,
      }));
    },

    assign: async (ctx, recordId: string, categoryId: string) => {
      if (!(await can(ctx.caller, "${names.id}:admin"))) {
        throw new Error("forbidden");
      }

      await ctx.tenant.db
        .update(${names.camel}Record)
        .set({ categoryId, updatedAt: new Date() })
        .where(eq(${names.camel}Record.id, recordId));
    },

    clear: async (ctx, recordId: string) => {
      if (!(await can(ctx.caller, "${names.id}:admin"))) {
        throw new Error("forbidden");
      }

      await ctx.tenant.db
        .update(${names.camel}Record)
        .set({ categoryId: null, updatedAt: new Date() })
        .where(eq(${names.camel}Record.id, recordId));
    },
  },

  configuration: {
    schema: configurationSchema,
    section: { id: "${names.id}", title: "${names.displayName}" },
    fields: {
      title: { id: "title", title: "Title" },
      pageSize: { id: "pageSize", title: "Page size" },
    },
  },

  events: [],

  capabilities: [],

  jobs: [],

  inboundEndpoints: [],

  integrationKinds: [],

  /**
   * Typed and empty: this module frames nothing, so it contributes no origin and the policy
   * stays denied (R-15b). A module that needs frames computes its origins here from its own
   * records, through the supplied tenant context.
   */
  contentSecurityPolicy: {
    frameOrigins: async () => [],
  },

  tests: { presets: ["unit", "integration", "e2e"] },
} satisfies Module;
`;

const declarationTest: Template = (names) =>
  `import { validateModule } from "@genie/core";
import { describe, expect, it } from "vitest";

import { ${names.camel}Module } from "./module.ts";

describe("the ${names.id} module declaration", () => {
  it("satisfies every rule the contract validator checks", () => {
    expect(validateModule(${names.camel}Module)).toEqual([]);
  });

  it("declares its own three permission keys and no other module's", () => {
    expect(${names.camel}Module.permissions.map((entry) => entry.key)).toEqual([
      "${names.id}:read",
      "${names.id}:use",
      "${names.id}:admin",
    ]);
  });

  it("requires its use key on every workspace entry (DEC-50)", () => {
    const workspace = ${names.camel}Module.navigation.entries.filter(
      (entry) => entry.surface === "workspace"
    );

    expect(workspace.length).toBeGreaterThan(0);

    for (const entry of workspace) {
      expect(entry.requiredPermission).toBe("${names.id}:use");
    }
  });

  it("claims no landing route, so an include list stays valid (DEC-49)", () => {
    for (const entry of ${names.camel}Module.navigation.entries) {
      expect(entry.landing).toBeUndefined();
    }
  });

  it("contributes no frame origin until it frames something", async () => {
    expect(
      await ${names.camel}Module.contentSecurityPolicy.frameOrigins()
    ).toEqual([]);
  });

  it("hands core a migration declaration it has not read yet", () => {
    expect(typeof ${names.camel}Module.schema.migrations).toBe("function");
    expect(${names.camel}Module.schema.migrationsTable).toBe(
      "${names.migrationsTable}"
    );
  });
});
`;

const accessTest: Template = (names) =>
  `import {
  can,
  createRequestPrincipal,
  createStubGrantReader,
} from "@genie/core";
import { describe, expect, it } from "vitest";

/**
 * The authorization half of this module's denial proof, against the real seam.
 *
 * \`can()\` is the only permission check there is (DEC-39), and the Section 0 stub grants one
 * key that belongs to another module, so every caller is refused here. The workspace page's
 * \`canUse\` prop is this value, and the refused stories render what a person then sees.
 *
 * A caller who is granted \`${names.id}:use\` arrives with real roles in Section 2. Until then a
 * failing expectation here is a real change in the seam, and widening the stub is never the fix.
 */
const identity = { userId: "u1", groups: [] };

describe("the ${names.id} access decision", () => {
  it("refuses a caller who holds no key at all", async () => {
    const caller = createRequestPrincipal(identity, () =>
      Promise.resolve({ keys: new Set(), scopes: new Map() })
    );

    expect(await can(caller, "${names.id}:use")).toBe(false);
    expect(await can(caller, "${names.id}:read")).toBe(false);
    expect(await can(caller, "${names.id}:admin")).toBe(false);
  });

  it("refuses the Section 0 stub principal, which holds another module's key", async () => {
    const caller = createRequestPrincipal(identity, createStubGrantReader());

    expect(await can(caller, "${names.id}:use")).toBe(false);
  });
});
`;

const index: Template = (names) =>
  `/**
 * The module-facing declaration. The application imports this and nothing else: the registry
 * mounts the router, the navigation and the pages from the one object below.
 *
 * A client or a story imports \`${names.packageName}/presentation\` instead, which carries the
 * components without the router, the schema or their server dependencies.
 */

export { ${names.camel}Module } from "./module.ts";

export { ${names.camel}Router, type ${names.pascal}Router } from "./router.ts";

export { MIGRATIONS, MIGRATIONS_TABLE, ${names.camel}Record } from "./schema.ts";
`;

const fixtures: Template = (names) =>
  `/**
 * Deterministic English fixtures for the presentation stories.
 *
 * They exist so a story renders without a database, a network call, or a tenant. They are not
 * seed data and they never reach a runtime path.
 */
export type ${names.pascal}RecordView = {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
};

export const ${names.camel}Records: readonly ${names.pascal}RecordView[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    label: "First record",
    detail: "A fixture row. It proves layout, not persistence.",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    label: "Second record",
    detail: "A second fixture row, so the empty state differs from the list.",
  },
];
`;

const workspacePage: Template = (names) =>
  `import { Disclosure } from "@genie/ui";

import type { ${names.pascal}RecordView } from "./__fixtures__/records.ts";

export type WorkspacePageProps = {
  readonly records: readonly ${names.pascal}RecordView[];
};

/**
 * The workspace page. It renders records and nothing else: the app mounts it behind the
 * entry's \`requiredPermission\` through the one authorization seam, so this component runs
 * only for a person who may see it, and a refused person gets the app's denied response
 * instead. A second check here would be a second seam (DEC-39), and a refusal rendered here
 * would say what the denied response deliberately does not.
 */
export function WorkspacePage(props: WorkspacePageProps) {
  return (
    <main>
      <h1>${names.displayName}</h1>
      {props.records.length === 0 ? (
        <p>No records yet.</p>
      ) : (
        <ul>
          {props.records.map((record) => (
            <li key={record.id}>
              <Disclosure summary={record.label}>{record.detail}</Disclosure>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
`;

const adminPage: Template = (names) =>
  `export type AdminPageProps = {
  /** How many records the workspace holds, read by the page that renders this. */
  readonly recordCount: number;
};

/**
 * The module's admin page. It is reached behind \`${names.id}:admin\`, the key that enabling the
 * entitlement appends to \`Tenant administrator\` (DEC-23).
 */
export function AdminPage(props: AdminPageProps) {
  return (
    <main>
      <h1>${names.displayName} settings</h1>
      <p>This deployment holds {props.recordCount} ${names.displayName} records.</p>
    </main>
  );
}
`;

const modulePages: Template = (names) =>
  `import { AdminPage } from "./admin-page.tsx";
import { WorkspacePage } from "./workspace-page.tsx";

/**
 * What the module registers under \`pages\`. Core mounts a page with no props, so each entry
 * here is the component the app renders. The read that fills these from \`ctx.tenant\` arrives
 * with the shell, so each entry renders its empty state for now. The components stay in their
 * own files, with their stories and their tests.
 *
 * Neither entry asks whether the person may be here. The app's page loader already asked, with
 * the entry's \`requiredPermission\`, and renders its own denied response instead of this
 * component when the answer is no. In Section 0 that answer is always no, because the stub
 * grants one key and it belongs to another module, which \`src/access.test.ts\` proves against
 * the real seam.
 */
export function ${names.pascal}WorkspacePage() {
  return <WorkspacePage records={[]} />;
}

export function ${names.pascal}AdminPage() {
  return <AdminPage recordCount={0} />;
}
`;

const presentationIndex: Template = (names) =>
  `/**
 * The client surface. A story, a component test and, later, the shell import from here, so
 * none of them pulls the router, the schema or their server dependencies into a browser.
 */

export { AdminPage, type AdminPageProps } from "./admin-page.tsx";

export { WorkspacePage, type WorkspacePageProps } from "./workspace-page.tsx";

export type { ${names.pascal}RecordView } from "./__fixtures__/records.ts";
`;

const workspaceStories: Template = (names) =>
  `import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ${names.camel}Records } from "./__fixtures__/records.ts";
import { WorkspacePage } from "./workspace-page.tsx";

const meta = {
  title: "Modules/${names.displayName}/Workspace page",
  component: WorkspacePage,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The ${names.displayName} workspace page, rendered from fixtures. It proves presentation only; authorization is proved by the router tests.",
      },
    },
  },
  args: { records: ${names.camel}Records },
} satisfies Meta<typeof WorkspacePage>;

export default meta;

type Story = StoryObj<typeof meta>;

// Every screen is proved at both viewports (DEC-25). "desktop" and "mobile1" are
// keys of the built-in minimal viewports, so no host configuration is needed.
export const Desktop: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("First record")).toBeInTheDocument();
    await expect(canvas.getByText("Second record")).toBeInTheDocument();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("First record")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { records: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No records yet.")).toBeInTheDocument();
  },
};

// A refused person never reaches this component: the app's page loader answers
// \`can()\` first and renders its own denied response instead. So no story here shows a
// refusal, and none may, because that response is the app's and says nothing about
// what it would have shown. \`src/access.test.ts\` proves the seam refuses every key this
// module owns, and the router test proves the refusal on the server. The denial seen in
// a browser at both viewports is the app route's end-to-end proof.
`;

const adminStories: Template = (names) =>
  `import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AdminPage } from "./admin-page.tsx";

const meta = {
  title: "Modules/${names.displayName}/Admin page",
  component: AdminPage,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The ${names.displayName} admin page. Reaching it requires \`${names.id}:admin\`; the story renders the page itself, not the check.",
      },
    },
  },
  args: { recordCount: 2 },
} satisfies Meta<typeof AdminPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "${names.displayName} settings" })
    ).toBeInTheDocument();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/2 ${names.displayName} records/)).toBeInTheDocument();
  },
};
`;

const factories: Template = (names) =>
  `import type { TenantContext } from "@genie/core";

import { ${names.camel}Record } from "../src/schema.ts";

export type ${names.pascal}RecordRow = typeof ${names.camel}Record.$inferSelect;

/**
 * Inserts one real row and answers it. The module owns the factories for its own tables, and
 * core never imports this file (R-39). It writes through the tenant context, so a test proves
 * the same path the product uses.
 */
export async function insert${names.pascal}Record(
  tenant: TenantContext,
  values: { readonly label?: string } = {}
): Promise<${names.pascal}RecordRow> {
  const [row] = await tenant.db
    .insert(${names.camel}Record)
    .values({ label: values.label ?? "A ${names.displayName} record" })
    .returning();

  if (row === undefined) {
    throw new Error("the insert returned no row");
  }

  return row;
}
`;

const testingIndex: Template = (names) =>
  `/**
 * The module's test-only seam. A test of another package imports the factory for this module's
 * table from here; the app-facing entry points never carry it (R-39 keeps the factories
 * module-owned, and nothing in a browser or a customer runtime imports them).
 */

export {
  type ${names.pascal}RecordRow,
  insert${names.pascal}Record,
} from "./factories.ts";
`;

const integrationTest: Template = (names) =>
  `import {
  createRequestPrincipal,
  createStubGrantReader,
  type ModuleRequestContext,
} from "@genie/core";
import { startDisposableDeployment } from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ${names.camel}Module } from "../src/module.ts";
import { ${names.camel}Router } from "../src/router.ts";
import { insert${names.pascal}Record } from "./factories.ts";

/**
 * This module against a real Postgres, with the real histories applied. No part of the database
 * is mocked (R-38).
 *
 * The Section 0 authorization stub grants one key, and it is not this module's. So the proof
 * here is refusal: the router denies every caller, and no protected row reaches one. A test
 * that needs a granted key is not fixed by widening the stub; it waits for real roles in
 * Section 2.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([${names.camel}Module]);
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

function contextFor(read: Parameters<typeof createRequestPrincipal>[1]) {
  return {
    tenant: deployment.context,
    caller: createRequestPrincipal({ userId: "u1", groups: [] }, read),
  } satisfies ModuleRequestContext;
}

describe("the ${names.id} schema against a real database", () => {
  it("applies its own migration and holds a real row", async () => {
    const row = await insert${names.pascal}Record(deployment.context, {
      label: "A real row",
    });

    expect(row.id.length).toBeGreaterThan(0);
    expect(row.label).toBe("A real row");
    expect(row.categoryId).toBeNull();
  });

  it("records its history in its own ledger, apart from core's", async () => {
    const ledgers = await deployment.context.db.$client.query<{
      tablename: string;
    }>(
      \`select tablename from pg_tables
       where tablename in ('__drizzle_migrations', '${names.migrationsTable}')\`
    );

    expect(ledgers.rows.map((entry) => entry.tablename).sort()).toEqual([
      "__drizzle_migrations",
      "${names.migrationsTable}",
    ]);
  });
});

describe("the ${names.id} read procedure", () => {
  it("refuses a caller the stub grants nothing, and returns no row", async () => {
    await insert${names.pascal}Record(deployment.context, {
      label: "A protected row",
    });

    const caller = ${names.camel}Router.createCaller(
      contextFor(() => Promise.resolve({ keys: new Set(), scopes: new Map() }))
    );

    await expect(caller.read()).rejects.toThrow("FORBIDDEN");
  });

  it("refuses the Section 0 stub principal, which holds another module's key", async () => {
    const caller = ${names.camel}Router.createCaller(
      contextFor(createStubGrantReader())
    );

    await expect(caller.read()).rejects.toThrow("FORBIDDEN");
  });
});
`;

const packageReadme: Template = (names) =>
  `# ${names.root}

The ${names.displayName} capability module.

## What belongs here

The module declaration and everything it names: the \`${names.table}\` schema with its own
migration history, the router behind \`can()\`, the permission keys, the navigation, the
configuration schema, the frame-origin provider, the page components with their fixtures and
stories, and the factories for its own tables under \`testing/\`.

Two entry points, so a browser never loads the server graph. \`${names.packageName}\` is the
module-facing declaration the application mounts. \`${names.packageName}/presentation\` is the
client surface a story and the shell render.

## What must not go here

A runtime registry import, a database client, a deployment environment read, an import of
another module, and any customer-specific content. Nothing here may be imported by core or by
another module.

## What it imports

\`@genie/core\`, \`@genie/ui\`, \`react\`, \`zod\`, \`@trpc/server\` and \`drizzle-orm\`. A module sits
above core and the user-interface package and below the app, so nothing here imports an app, a
customer folder, or a sibling module.
`;

const srcReadme: Template = () =>
  `# src

The module's source. \`index.ts\` is the module-facing surface the application imports, and
\`presentation/index.ts\` is the client surface a story and the shell import.

## What belongs here

The module declaration, its schema, its router, and the three folders the repository convention
names, created only when they hold something: \`lib/\` for a mini-package with its own API,
\`services/\` for work the application does, and \`utils/\` for a small generic stateless helper.
\`presentation/\` holds the components and their fixtures.

## What must not go here

A permission evaluation of its own: every check goes through core's \`can()\`. A read of the
deployment environment or of the runtime registry. A database driver: the router reads through
\`ctx.tenant.db\`, which core owns. A factory for this module's tables, which lives in
\`testing/\`.

## What it imports

\`@genie/core\`, \`@genie/ui\`, \`react\`, \`zod\`, \`@trpc/server\`, \`drizzle-orm\`, and its own files.
Never another module, never an app, never a customer folder, never a database driver.
`;

const presentationReadme: Template = () =>
  `# src/presentation

What the module renders.

## What belongs here

Components, their stories, and their fixtures. A component takes its data as props, so it
renders in a story with no database, no network call, and no tenant. The stories are the
specification: they document the component on its Docs page and they are the browser behavior
tests the Storybook host runs.

## What must not go here

Data fetching, a query client, a permission check, and any import of the runtime registry or
the deployment environment. A component that cannot render from props alone does not belong in
this folder.

## What it imports

\`@genie/ui\`, \`react\`, and its own fixtures. The story file also imports the Storybook types.
`;

const fixturesReadme: Template = () =>
  `# src/presentation/\\_\\_fixtures\\_\\_

The browser-safe sample data the stories render.

## What belongs here

Plain deterministic data and the view types that describe it. A fixture is a literal value,
written in English, stable across runs, so a story renders the same thing every time and a
failure names a real change.

## What must not go here

Seed data, a factory that talks to a database, a schema import, a server type, and anything
that runs at application runtime. A fixture exists for a story and never reaches a runtime
path.

## What it imports

Nothing. A fixture is data.
`;

const testingReadme: Template = (names) =>
  `# ${names.root}/testing

The module's own test helpers.

## What belongs here

Factories for this module's tables, and the real-database integration tests of its router and
its schema. A module owns the factories for its own tables; core holds none of them (R-39).

## What must not go here

A unit test, which lives beside its source under \`src/\`. A core table factory. A database
mock: every test here takes a disposable Postgres with the real migration histories applied. A
widened authorization stub: this module's procedures are refused in Section 0, and that refusal
is the proof.

## What it imports

The module's own source, the core test helpers, and \`@genie/core\`.
`;

/**
 * Every file the module generator writes, keyed by its path inside the module package
 * (R-30). The three-folder layout, a README in every folder it creates, and the module's own
 * drizzle-kit history are all here, so the rendered set is readable in one place.
 */
export const MODULE_TEMPLATES = {
  "package.json": manifest,
  "tsconfig.json": tsconfig,
  "vitest.config.ts": unitConfig,
  "vitest.integration.config.ts": integrationConfig,
  "drizzle.config.ts": drizzleConfig,
  "README.md": packageReadme,
  [`drizzle/${FIRST_TAG}.sql`]: firstMigration,
  "drizzle/meta/_journal.json": journal,
  // drizzle-kit names a snapshot after the entry index, not after the tag.
  "drizzle/meta/0000_snapshot.json": snapshot,
  "src/README.md": srcReadme,
  "src/index.ts": index,
  "src/module.ts": declaration,
  "src/module.test.ts": declarationTest,
  "src/access.test.ts": accessTest,
  "src/router.ts": router,
  "src/schema.ts": schema,
  "src/presentation/README.md": presentationReadme,
  "src/presentation/index.ts": presentationIndex,
  "src/presentation/module-pages.tsx": modulePages,
  "src/presentation/workspace-page.tsx": workspacePage,
  "src/presentation/workspace-page.stories.tsx": workspaceStories,
  "src/presentation/admin-page.tsx": adminPage,
  "src/presentation/admin-page.stories.tsx": adminStories,
  "src/presentation/__fixtures__/README.md": fixturesReadme,
  "src/presentation/__fixtures__/records.ts": fixtures,
  "testing/README.md": testingReadme,
  "testing/index.ts": testingIndex,
  "testing/factories.ts": factories,
  "testing/router.integration.test.ts": integrationTest,
} satisfies Readonly<Record<string, Template>>;
