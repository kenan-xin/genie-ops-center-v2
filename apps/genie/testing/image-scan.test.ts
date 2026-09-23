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
  secretPathFinding,
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
        createdBy: `RUN echo "Authorization: Bearer ${"a".repeat(32)}" > /tmp/x`,
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
        path: "node_modules/.pnpm/@genie+module-placeholder@0/node_modules/@genie/module-placeholder/dist/index.js",
        content: "export {};",
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

  it("flags an excluded module's installed package, folder and ledger", () => {
    const files = [
      {
        path: "node_modules/.pnpm/@genie+module-solutions@0/node_modules/@genie/module-solutions/dist/index.js",
        content: "export {};",
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

  // pg4: bundler output does not preserve package origin, so a route string in a
  // built chunk proves nothing about which package it came from. Exclusion is
  // proved at the build input instead (the builder-stage prune).
  it("does not treat an excluded module's route strings in a built chunk as a finding", () => {
    const files = [
      {
        path: "/app/apps/genie/.next/server/chunks/routes.js",
        content: `const routes = ["/m/solutions", "/admin/m/solutions"];`,
      },
    ];

    expect(scanFiles(files, base)).toEqual([]);
  });

  // AC-17 keeps its input after pg4: the path needles still mark an excluded
  // module's installed package, so its SQL is still a migration-file finding.
  it("still flags excluded-module migration SQL under its installed package", () => {
    const files = [
      {
        path: "/app/node_modules/.pnpm/@genie+module-solutions@0/node_modules/@genie/module-solutions/drizzle/0000_x.sql",
        content: "create table solutions_row (id uuid);",
      },
    ];

    const kinds = scanFiles(files, base).map((finding) => finding.kind);

    expect(kinds).toContain("excluded-module");
    expect(kinds).toContain("migration-file");
  });

  it("does not flag a manifest that names an excluded module", () => {
    // The real false positive the strengthened release smoke found: the app's
    // own package.json declares every workspace module, so it names an excluded
    // one in every build. A declaration is not an installed package.
    const files = [
      {
        path: "/app/apps/genie/package.json",
        content: `{"dependencies":{"@genie/module-placeholder":"workspace:*"}}`,
      },
    ];

    expect(
      scanFiles(files, {
        includedModules: [],
        excludedModules: ["placeholder"],
      })
    ).toEqual([]);
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

  it("flags an installed Storybook, devtools or test package, and stories", () => {
    const files = [
      {
        path: "/app/node_modules/.pnpm/@tanstack+react-devtools@1/node_modules/@tanstack/react-devtools/dist/index.js",
        content: "export {};",
      },
      {
        path: "/app/node_modules/.pnpm/vitest@4/node_modules/vitest/dist/index.js",
        content: "export {};",
      },
      {
        path: "/app/apps/genie/public/storybook-static/index.html",
        content: "<html></html>",
      },
      {
        path: "/app/apps/genie/src/foo.stories.tsx",
        content: "export default {};",
      },
    ];

    const kinds = scanFiles(files, base).map((finding) => finding.kind);

    expect(kinds.filter((kind) => kind === "dev-tooling").length).toBe(4);
  });

  it("does not flag a manifest that merely names a dev-only package", () => {
    // The real false positive this rule was narrowed for: Next's and pg's own
    // manifests list test tooling in their devDependencies/scripts, but neither
    // installs it into the runtime image.
    const files = [
      {
        path: "/app/node_modules/.pnpm/next@16/node_modules/next/package.json",
        content: `{"devDependencies":{"@playwright/test":"1.63.0","vitest":"4.1.11"}}`,
      },
      {
        path: "/app/apps/genie/package.json",
        content: `{"devDependencies":{"@tanstack/react-devtools":"0.10.12"}}`,
      },
    ];

    expect(scanFiles(files, base)).toEqual([]);
  });

  it("flags a secret-bearing file and a private key in content", () => {
    const files = [
      {
        path: "/app/apps/genie/.next/server/chunks/config.js",
        content: "-----BEGIN PRIVATE KEY-----",
      },
      {
        path: "/app/apps/genie/.env.production",
        content: "DATABASE_URL=postgres://x",
      },
      { path: "/app/certs/server.pem", content: "not really a key" },
    ];

    const kinds = scanFiles(files, base).map((finding) => finding.kind);

    expect(kinds.filter((kind) => kind === "secret").length).toBe(3);
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

  it("accepts an empty file, which is legal and encodes to an empty string", () => {
    const files = filesystemEntries(
      JSON.stringify({ path: "/app/empty.js", b64: "" })
    );

    expect(files).toEqual([{ path: "/app/empty.js", content: "" }]);
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
    expect(needle).not.toContain("/m/solutions");
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

  it("keeps only high-signal content needles", () => {
    const needles = secretNeedles();

    for (const sample of [
      "-----BEGIN RSA PRIVATE KEY-----",
      `Authorization: Bearer ${"a".repeat(32)}`,
    ]) {
      expect(needles.some((needle) => needle.test(sample))).toBe(true);
    }

    // Ordinary bundled code must not trip the content rules.
    for (const sample of [
      "PASSWORD",
      "password: this.password",
      "apiKey: config.apiKey",
      "postgres://user:pass@host:5432/db",
    ]) {
      expect(needles.some((needle) => needle.test(sample))).toBe(false);
    }
  });

  it("names the secret-bearing file types by path", () => {
    expect(secretPathFinding("/app/apps/genie/.env")).toBe(".env");
    expect(secretPathFinding("/app/apps/genie/.env.production")).toBe(
      ".env.production"
    );
    expect(secretPathFinding("/app/certs/server.pem")).toBe("server.pem");
    expect(secretPathFinding("/app/keys/id_rsa")).toBe("id_rsa");
    expect(secretPathFinding("/app/.npmrc")).toBe(".npmrc");
    // Not a secret file: a source file whose name merely starts with "env".
    expect(secretPathFinding("/app/src/environment.ts")).toBeUndefined();
    expect(secretPathFinding("/app/src/index.js")).toBeUndefined();
  });
});
