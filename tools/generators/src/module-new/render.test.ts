import { describe, expect, it } from "vitest";

import { moduleNamingError } from "../workspace/module-naming.ts";
import { renderModule } from "./render.ts";

const files = renderModule({ id: "demo" });

function read(path: string): string {
  const content = files.get(path);

  if (content === undefined) {
    throw new Error(`the generator rendered no ${path}`);
  }

  return content;
}

const EXPECTED_FILES = [
  "packages/modules/demo/README.md",
  "packages/modules/demo/drizzle.config.ts",
  "packages/modules/demo/drizzle/0000_initial.sql",
  "packages/modules/demo/drizzle/meta/0000_snapshot.json",
  "packages/modules/demo/drizzle/meta/_journal.json",
  "packages/modules/demo/package.json",
  "packages/modules/demo/src/README.md",
  "packages/modules/demo/src/index.ts",
  "packages/modules/demo/src/module.test.ts",
  "packages/modules/demo/src/module.ts",
  "packages/modules/demo/src/presentation/README.md",
  "packages/modules/demo/src/presentation/__fixtures__/README.md",
  "packages/modules/demo/src/presentation/__fixtures__/records.ts",
  "packages/modules/demo/src/presentation/admin-page.stories.tsx",
  "packages/modules/demo/src/presentation/admin-page.tsx",
  "packages/modules/demo/src/presentation/index.ts",
  "packages/modules/demo/src/presentation/module-pages.tsx",
  "packages/modules/demo/src/presentation/workspace-page.stories.tsx",
  "packages/modules/demo/src/presentation/workspace-page.tsx",
  "packages/modules/demo/src/router.ts",
  "packages/modules/demo/src/schema.ts",
  "packages/modules/demo/testing/README.md",
  "packages/modules/demo/testing/factories.ts",
  "packages/modules/demo/testing/index.ts",
  "packages/modules/demo/testing/router.integration.test.ts",
  "packages/modules/demo/tsconfig.json",
  "packages/modules/demo/vitest.config.ts",
  "packages/modules/demo/vitest.integration.config.ts",
];

describe("the rendered file set", () => {
  it("is exactly the files the module contract names", () => {
    expect([...files.keys()].toSorted()).toEqual(EXPECTED_FILES);
  });

  it("puts a README.md in every folder it creates", () => {
    const folders = new Set(
      [...files.keys()].map((path) => path.slice(0, path.lastIndexOf("/")))
    );

    // The drizzle folders are drizzle-kit's, not folders of the layout convention.
    const authored = [...folders].filter(
      (folder) => !folder.includes("/drizzle")
    );

    for (const folder of authored) {
      expect(files.has(`${folder}/README.md`)).toBe(true);
    }
  });

  it("renders no empty file", () => {
    for (const [path, content] of files) {
      expect(content.length, path).toBeGreaterThan(0);
      expect(content.endsWith("\n"), path).toBe(true);
    }
  });

  it("leaves no unrendered placeholder behind", () => {
    for (const [path, content] of files) {
      expect(content, path).not.toContain("TODO");
      expect(content, path).not.toContain("<capability>");
    }
  });
});

describe("the rendered manifest", () => {
  // SAFETY: the bytes are the generator's own JSON template, and every field read
  // below is asserted against an expected value rather than trusted.
  const manifest = JSON.parse(read("packages/modules/demo/package.json")) as {
    name: string;
    exports: Record<string, string>;
    genie: { module: { id: string; entrypoint: string } };
    nx: { tags: string[] };
  };

  it("names the package after the unprefixed id", () => {
    expect(manifest.name).toBe("@genie/module-demo");
    expect(manifest.genie.module.id).toBe("demo");
    expect(manifest.genie.module.entrypoint).toBe("src/index.ts");
  });

  it("agrees with the shared naming invariant", () => {
    expect(
      moduleNamingError("demo", manifest.name, manifest.genie.module.id)
    ).toBeUndefined();
  });

  it("carries the module tag and the three entry points", () => {
    expect(manifest.nx.tags).toEqual(["module"]);
    expect(Object.keys(manifest.exports).toSorted()).toEqual([
      ".",
      "./presentation",
      "./testing",
    ]);
  });
});

describe("the rendered migration declaration", () => {
  const schema = read("packages/modules/demo/src/schema.ts");

  it("declares each SQL file with a static URL at module scope", () => {
    expect(schema).toContain(
      'new URL("../drizzle/0000_initial.sql", import.meta.url)'
    );
  });

  it("defers the read behind a function, never an eager array", () => {
    expect(schema).toContain("export const MIGRATIONS = () =>");
    expect(schema).toContain("migrationsFromJournal(journal, MIGRATION_FILES)");
    expect(schema).not.toMatch(/export const MIGRATIONS[^=]*= \[/);
  });

  it("owns a migrations table named after the module", () => {
    expect(schema).toContain('"__drizzle_migrations_demo"');
    expect(read("packages/modules/demo/drizzle.config.ts")).toContain(
      "__drizzle_migrations_demo"
    );
  });

  it("hands the declaration to the module without calling it", () => {
    const module = read("packages/modules/demo/src/module.ts");

    expect(module).toContain("migrations: MIGRATIONS,");
    expect(module).not.toContain("migrations: MIGRATIONS()");
  });

  it("names the same tag in the journal, the file and the declaration", () => {
    // SAFETY: the bytes are the generator's own journal template, and the one
    // field read below is compared with the tag the other two files carry.
    const journal = JSON.parse(
      read("packages/modules/demo/drizzle/meta/_journal.json")
    ) as { entries: { tag: string }[] };

    const [entry] = journal.entries;

    expect(entry?.tag).toBe("0000_initial");
    expect(files.has(`packages/modules/demo/drizzle/${entry?.tag}.sql`)).toBe(
      true
    );
    expect(schema).toContain(`"${entry?.tag}"`);
  });

  it("creates the module's own table and no other", () => {
    const sql = read("packages/modules/demo/drizzle/0000_initial.sql");

    expect(sql).toContain('CREATE TABLE "demo_record"');
    expect(sql.match(/CREATE TABLE/g)).toHaveLength(1);
  });
});

describe("the rendered declaration", () => {
  const module = read("packages/modules/demo/src/module.ts");

  it("declares the three permission keys of the contract", () => {
    expect(module).toContain('key: "demo:read"');
    expect(module).toContain('key: "demo:use"');
    expect(module).toContain('key: "demo:admin"');
  });

  it("grants nothing beyond its own keys", () => {
    expect(module).not.toContain("placeholder:");
  });

  it("carries a typed empty frame-origin provider", () => {
    expect(module).toContain("contentSecurityPolicy");
    expect(module).toContain("frameOrigins: async () => []");
  });

  it("declares the category and settings points S0-08 requires", () => {
    expect(module).toContain("configuration");
    expect(module).toContain("categoryId");
  });

  it("reads only through the tenant context", () => {
    const router = read("packages/modules/demo/src/router.ts");

    expect(router).toContain("async ({ ctx })");
    expect(router).toContain("ctx.tenant.db");
    expect(router).toContain('can(ctx.caller, "demo:read")');
    expect(router).not.toContain("drizzle-orm/node-postgres");
  });
});

describe("the rendered user interface", () => {
  it("ships a documented story at both viewports", () => {
    const story = read(
      "packages/modules/demo/src/presentation/workspace-page.stories.tsx"
    );

    expect(story).toContain('tags: ["autodocs"]');
    expect(story).toContain('viewport: { value: "desktop"');
    expect(story).toContain('viewport: { value: "mobile1"');
    expect(story).toContain("await expect(");
  });

  it("proves denied access at both viewports, with no protected row shown", () => {
    const story = read(
      "packages/modules/demo/src/presentation/workspace-page.stories.tsx"
    );

    expect(story).toContain("export const DeniedDesktop");
    expect(story).toContain("export const DeniedPhone");
    expect(story).toContain("permitted: false");

    // The refused stories keep the fixture rows in args, so the assertion proves
    // the page withholds them rather than that none were supplied.
    expect(
      story.match(/queryByText\("First record"\)\)\.not\.toBeInTheDocument/g)
    ).toHaveLength(2);
  });

  it("keeps fixtures free of a server import", () => {
    const fixtures = read(
      "packages/modules/demo/src/presentation/__fixtures__/records.ts"
    );

    expect(fixtures).not.toContain("import");
  });
});

describe("the identifier guard", () => {
  it.each(["Demo", "demo_module", "-demo", "demo-", "", "@genie/module-demo"])(
    "refuses the id %s",
    (id) => {
      expect(() => renderModule({ id })).toThrow(/module id/);
    }
  );

  it("accepts a multi-word id and renders its names from it", () => {
    const rendered = renderModule({ id: "contract-data" });

    // SAFETY: the bytes are the generator's own JSON template; a missing file
    // falls back to an empty object, whose name is undefined and fails here.
    const manifest = JSON.parse(
      rendered.get("packages/modules/contract-data/package.json") ?? "{}"
    ) as { name?: string };

    expect(manifest.name).toBe("@genie/module-contract-data");
    expect(
      rendered.get("packages/modules/contract-data/src/module.ts")
    ).toContain("export const contractDataModule");
    expect(
      rendered.get("packages/modules/contract-data/drizzle/0000_initial.sql")
    ).toContain('CREATE TABLE "contract_data_record"');
  });

  it("renders the same bytes for the same id", () => {
    expect([...renderModule({ id: "demo" })]).toEqual([...files]);
  });
});
