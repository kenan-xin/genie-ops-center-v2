import { describe, expect, it } from "vitest";

import {
  EXCLUDED_MODULE_PATH_NEEDLE,
  MAX_SCANNED_FILE_BYTES,
  declaredBuildArguments,
  devToolingNeedles,
  filesystemEntries,
  scanFiles,
  scanHistory,
  secretNeedles,
} from "./image-scan.ts";

describe("the image history scanner", () => {
  it("accepts MODULE_INCLUDE as the only build argument", () => {
    const findings = scanHistory([
      { createdBy: "RUN /bin/sh -c npm install --global pnpm@12.4.2" },
      { createdBy: "ARG MODULE_INCLUDE" },
      { createdBy: "ARG BUILDKIT_SBOM_SCAN_CONTEXT" },
    ]);

    // BUILDKIT's own injected metadata args are not build arguments the
    // Dockerfile declares, so only a declared non-MODULE_INCLUDE arg is a finding.
    expect(findings).toEqual([]);
  });

  it("flags a second declared build argument", () => {
    const findings = scanHistory([
      { createdBy: "ARG MODULE_INCLUDE" },
      { createdBy: "ARG CUSTOMER_SECRET" },
    ]);

    expect(findings.map((finding) => finding.kind)).toContain("build-argument");
    expect(
      findings.some((finding) => finding.detail.includes("CUSTOMER_SECRET"))
    ).toBe(true);
  });

  it("flags a secret that a history line would expose", () => {
    const findings = scanHistory([
      {
        createdBy:
          "ENV DATABASE_URL=postgres://genie:sup3rsecret@db:5432/genie",
      },
    ]);

    expect(findings.some((finding) => finding.kind === "secret")).toBe(true);
  });

  it("does not flag an environment variable name with no value", () => {
    expect(scanHistory([{ createdBy: "ENV DATABASE_URL" }])).toEqual([]);
  });
});

describe("the image filesystem scanner", () => {
  const base = {
    includedModules: ["placeholder"],
    excludedModules: ["solutions"],
  };

  it("is non-vacuous: it finds an included module and leaks nothing for it", () => {
    const files = [
      {
        path: "apps/genie/src/modules.ts",
        content: `import { placeholder } from "@genie/module-placeholder";`,
      },
    ];

    const findings = scanFiles(files, base);

    expect(findings).toEqual([]);

    // The control: the same scanner run with the included module excluded finds
    // it, so a clean result above is not the scanner matching nothing.
    const control = scanFiles(files, {
      includedModules: [],
      excludedModules: ["placeholder"],
    });

    expect(control.some((finding) => finding.kind === "excluded-module")).toBe(
      true
    );
  });

  it("flags an excluded module's package, path and migration ledger", () => {
    const files = [
      {
        path: "apps/genie/src/modules.ts",
        content: `"@genie/module-solutions"`,
      },
      {
        path: "packages/modules/solutions/drizzle/0000_x.sql",
        content: "create table solutions_row (id uuid);",
      },
      {
        path: "apps/genie/.next/server/chunks/a.js",
        content: `"__drizzle_migrations_solutions"`,
      },
    ];

    const kinds = scanFiles(files, base).map((finding) => finding.kind);

    expect(kinds).toContain("excluded-module");
    expect(kinds).toContain("migration-file");
  });

  it("flags publicly served migration SQL but not the server-side history", () => {
    const served = scanFiles(
      [
        {
          path: "apps/genie/public/migrations/0000_x.sql",
          content: "select 1;",
        },
        {
          path: "apps/genie/.next/static/media/0000_boring.sql",
          content: "select 1;",
        },
      ],
      base
    );

    expect(
      served.filter((finding) => finding.kind === "migration-file")
    ).toHaveLength(2);

    const serverSide = scanFiles(
      [
        {
          path: "apps/genie/.next/server/chunks/sql.js",
          content: `const sql = "create table placeholder_record (id uuid);";`,
        },
      ],
      base
    );

    expect(
      serverSide.filter((finding) => finding.kind === "migration-file")
    ).toEqual([]);
  });

  it("flags Storybook, stories and development-only packages", () => {
    const files = [
      {
        path: "apps/genie/.next/server/chunks/dev.js",
        content: `require("@tanstack/react-devtools")`,
      },
      {
        path: "apps/genie/public/storybook-static/index.html",
        content: "<html></html>",
      },
      { path: "apps/genie/src/foo.stories.tsx", content: "export default {};" },
      { path: "apps/genie/node_modules/.bin/vitest", content: "" },
    ];

    const kinds = scanFiles(files, base).map((finding) => finding.kind);

    expect(
      kinds.filter((kind) => kind === "dev-tooling").length
    ).toBeGreaterThanOrEqual(4);
  });

  it("flags a secret embedded in a shipped file", () => {
    const files = [
      {
        path: "apps/genie/.next/server/chunks/config.js",
        content: `process.env.DATABASE_URL="postgres://user:hunter2@db:5432/app"`,
      },
      {
        path: "apps/genie/public/private.pem",
        content: "-----BEGIN PRIVATE KEY-----",
      },
    ];

    const kinds = scanFiles(files, base).map((finding) => finding.kind);

    expect(kinds).toContain("secret");
  });

  it("does not flag ordinary application content", () => {
    const files = [
      {
        path: "apps/genie/.next/server/app/page.js",
        content: `self.__next_f.push("Welcome to the operations center")`,
      },
      {
        path: "apps/genie/public/branding/logo.svg",
        content: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
      },
    ];

    expect(scanFiles(files, base)).toEqual([]);
  });
});

describe("the Dockerfile argument parser", () => {
  it("reads the declared argument names and ignores comments and ENV", () => {
    const dockerfile = [
      "# ARG NOT_A_DECLARATION",
      "FROM node:26-alpine AS builder",
      "",
      "ARG MODULE_INCLUDE",
      "ENV MODULE_INCLUDE=${MODULE_INCLUDE}",
      "ARG   SPACED_NAME  ",
    ].join("\n");

    expect(declaredBuildArguments(dockerfile)).toEqual([
      "MODULE_INCLUDE",
      "SPACED_NAME",
    ]);
  });

  it("returns nothing for a Dockerfile that declares no argument", () => {
    expect(declaredBuildArguments("FROM scratch\n")).toEqual([]);
  });
});

/** One in-container inventory line for a file whose content is `content`. */
const inventoryLine = (path: string, content: string) =>
  JSON.stringify({ path, b64: Buffer.from(content).toString("base64") });

describe("the filesystem inventory parser", () => {
  it("decodes content and de-duplicates a path read twice", () => {
    const files = filesystemEntries(
      [
        inventoryLine("/app/server.js", "self.__next_f.push()"),
        inventoryLine("/app/server.js", "self.__next_f.push()"),
        inventoryLine("/app/modules.ts", 'import "@genie/module-placeholder";'),
      ].join("\n")
    );

    expect(files).toHaveLength(2);
    expect(files[0]?.content).toContain("__next_f");
  });

  it("fails closed on an oversized file instead of scanning nothing", () => {
    expect(() =>
      filesystemEntries(
        JSON.stringify({
          path: "/app/big.js",
          oversized: MAX_SCANNED_FILE_BYTES + 1,
        })
      )
    ).toThrow(/fails closed/);
  });

  it("fails closed on a malformed line", () => {
    expect(() => filesystemEntries("{not json")).toThrow();
    expect(() => filesystemEntries(JSON.stringify({ b64: "aGk=" }))).toThrow(
      /malformed/
    );
  });
});

describe("the scanner's needles", () => {
  it("names an excluded module by package, folder and ledger", () => {
    const needle = EXCLUDED_MODULE_PATH_NEEDLE("solutions");

    expect(needle).toContain("@genie/module-solutions");
    expect(needle).toContain("packages/modules/solutions/");
    expect(needle).toContain("__drizzle_migrations_solutions");
  });

  it("covers the development-only tooling families this project uses", () => {
    const needles = devToolingNeedles().join("\n");

    for (const tool of [
      "storybook",
      "@tanstack/react-devtools",
      "@genie/generators",
      "vitest",
    ]) {
      expect(needles).toContain(tool);
    }
  });

  it("covers the secret families R-33 names", () => {
    const needles = secretNeedles();

    const samples = [
      "postgres://user:pw@host:5432/db",
      "-----BEGIN PRIVATE KEY-----",
      "PASSWORD=hunter2",
      "api_key: sk-live-123",
    ];

    for (const sample of samples) {
      expect(needles.some((needle) => needle.test(sample))).toBe(true);
    }

    expect(needles.some((needle) => needle.test("PASSWORD"))).toBe(false);
  });
});
