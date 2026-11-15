import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { bannedHits, formatHit, readGlossary } from "./glossary-scan.ts";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../..");

const GLOSSARY = "docs/design/design-system/terminology.md";

const SCANNED = [
  "packages/ui",
  "packages/core",
  "packages/modules",
  "apps/genie",
  "customers",
];

const SOURCE = /\.(?:tsx?|m?js)$|^apps\/genie\/src\/messages\/[^/]+\.json$/;

const NOT_SHIPPED =
  /\.(?:test|spec|stories)\.|\.d\.ts$|(?:^|\/)(?:__fixtures__|__tests__|__testing__|__mocks__|testing|e2e|tools|scripts|drizzle|migrations)\/|__(?:boundary|wiring|antislop|shadcn)__/;

const CUSTOMER_APP = /^customers\/[^/]+\/app\//;

/**
 * Hits still on screen, by path, then phrase, then count. Tasks 4 to 10 of phase 05 sweep
 * these strings and lower their rows; the ledger goes once it is empty.
 */
const PENDING_SWEEP = {
  "apps/genie/src/messages/en.json": {
    "local groups": 1,
    "display label": 1,
    "local group": 1,
    "/\\bGenie\\b(?! Ops Center)/": 1,
    "disabled": 1,
  },
  "packages/core/src/features/account/account-page.tsx": {
    "/\\bGenie\\b(?! Ops Center)/": 1,
    "you hold": 2,
    "what you hold": 1,
    "hold no roles": 1,
  },
  "packages/core/src/features/agent/agent-button.tsx": {
    agent: 3,
  },
  "packages/core/src/features/agent/agent-panel-host.tsx": {
    agent: 4,
    artifact: 1,
  },
  "packages/core/src/features/agent/artifact-panel.tsx": {
    "artifact": 6,
    "the chat": 1,
    "artifacts": 1,
  },
  "packages/core/src/features/agent/artifact-slot.tsx": {
    artifact: 1,
  },
  "packages/core/src/features/agent/ask-screen.tsx": {
    "artifact": 1,
    "the chat": 2,
  },
  "packages/core/src/features/agent/composer.tsx": {
    "ask about your": 2,
  },
  "packages/core/src/features/agent/handoff-card.tsx": {
    "passed to the": 1,
  },
  "packages/core/src/features/agent/message-parts.tsx": {
    artifacts: 1,
  },
  "packages/core/src/features/agent/read-rows-panel.tsx": {
    "the chat": 1,
    "rows read from": 2,
    "new read": 1,
  },
  "packages/core/src/features/audit/audit-log.tsx": {
    "path": 1,
    "clear all": 1,
  },
  "packages/core/src/features/break-glass/break-glass-account.tsx": {
    "/\\bGenie\\b(?! Ops Center)/": 1,
  },
  "packages/core/src/features/categories/assign-items.tsx": {
    "who can open it": 1,
  },
  "packages/core/src/features/groups/groups-screen.tsx": {
    "not seen yet": 2,
    "stale": 2,
    "/\\bGenie\\b(?! Ops Center)/": 1,
    "never synced": 1,
    "local group": 4,
    "holds no role": 1,
    "display label": 2,
    "edit label": 1,
    "local groups": 1,
  },
  "packages/core/src/features/people/people-screen.tsx": {
    "disabled": 3,
    "disable": 5,
    "remove person": 1,
    "holds no role": 1,
    "enable": 2,
    "re-enable": 2,
    "local group": 1,
    "local groups": 1,
    "clear all": 1,
    "/\\bswitch(?:es|ed|ing)?\\b(?:\\s+\\S+){0,3}?\\s+(?:on|off)\\b/i": 2,
  },
  "packages/core/src/features/settings/ai-sections.tsx": {
    "remove key": 2,
  },
  "packages/core/src/features/settings/settings-screen.tsx": {
    "disabled": 1,
    "/\\bswitch(?:es|ed|ing)?\\b(?:\\s+\\S+){0,3}?\\s+(?:on|off)\\b/i": 3,
    "the assistant": 1,
    "enabled": 1,
  },
  "packages/core/src/lib/module-contract/validate.ts": {
    "system role": 1,
  },
  "packages/core/src/services/administrators/index.ts": {
    enable: 1,
    disabled: 1,
  },
  "packages/core/src/services/agent/brief.ts": {
    artifact: 1,
  },
  "packages/core/src/services/agent/file-job.ts": {
    agent: 1,
  },
  "packages/core/src/services/agent/loop-guard.ts": {
    agent: 1,
  },
  "packages/core/src/services/agent/run-job.ts": {
    agent: 3,
  },
  "packages/core/src/services/agent/store.ts": {
    agent: 1,
  },
  "packages/core/src/services/groups/index.ts": {
    "display label": 2,
    "local group": 6,
  },
  "packages/core/src/services/mailer/templates.tsx": {
    enabled: 1,
  },
  "packages/core/src/services/people/index.ts": {
    "/\\bGenie\\b(?! Ops Center)/": 1,
    "disabled": 1,
    "enabled": 1,
    "re-enabled": 1,
  },
  "packages/modules/analytics/src/agent-surface.ts": {
    agent: 1,
  },
  "packages/modules/analytics/src/errors.ts": {
    "remove a panel": 1,
  },
  "packages/modules/analytics/src/presentation/dashboard-view.tsx": {
    "the chat": 1,
    "chat is off": 1,
  },
  "packages/modules/analytics/src/presentation/view-menu.tsx": {
    "remove view": 1,
  },
  // The descriptions are model-facing (91 recordings): sweep only the titles and labels, then
  // add `link` and `linked` to the datasets.ts exception row.
  "packages/modules/invoices/src/datasets.ts": {
    "linked": 11,
    "links": 1,
    "payment links": 1,
    "link": 3,
  },
  "packages/modules/invoices/src/errors.ts": {
    "links": 3,
    "payment links": 1,
    "link": 1,
    "linked": 1,
  },
  "packages/modules/invoices/src/module.ts": {
    links: 2,
  },
  "packages/modules/invoices/src/permissions.ts": {
    links: 1,
  },
  "packages/modules/invoices/src/presentation/allocations.tsx": {
    "by a person": 1,
    "link": 2,
  },
  "packages/modules/invoices/src/presentation/automatic-links.tsx": {
    link: 3,
    linked: 1,
  },
  "packages/modules/invoices/src/presentation/document-inbox.tsx": {
    "what we found": 1,
    "needs you": 2,
    "payment evidence": 1,
  },
  "packages/modules/invoices/src/presentation/document-kind.ts": {
    "payment evidence": 1,
  },
  "packages/modules/invoices/src/presentation/document-review.tsx": {
    "classified as": 2,
  },
  "packages/modules/invoices/src/presentation/document-status-badge.tsx": {
    linked: 1,
  },
  "packages/modules/invoices/src/presentation/history-text.ts": {
    "by a person": 1,
    "linked": 1,
    "link": 1,
    "unlinked": 1,
  },
  "packages/modules/invoices/src/presentation/invoice-list.tsx": {
    "balances as of": 1,
  },
  "packages/modules/invoices/src/presentation/invoice-record.tsx": {
    "by a person": 1,
    "balances as of": 1,
    "linked": 1,
  },
  "packages/modules/invoices/src/presentation/invoice-review-form.tsx": {
    link: 1,
    unspecified: 4,
  },
  "packages/modules/invoices/src/presentation/link-dialogs.tsx": {
    "link": 8,
    "linked": 2,
    "not linked": 1,
    "links": 1,
  },
  "packages/modules/invoices/src/presentation/list-definitions.ts": {
    "linked": 2,
    "not linked": 1,
    "needs you": 1,
  },
  "packages/modules/invoices/src/presentation/payment-links.tsx": {
    link: 4,
    linked: 1,
    links: 1,
  },
  "packages/modules/invoices/src/presentation/payment-list.tsx": {
    "linked": 2,
    "not linked": 1,
    "amounts as of": 1,
  },
  "packages/modules/invoices/src/presentation/payment-record.tsx": {
    "link": 1,
    "amounts as of": 1,
  },
  "packages/modules/invoices/src/presentation/payment-review-form.tsx": {
    linked: 1,
  },
  "packages/modules/invoices/src/presentation/record-parts.tsx": {
    linked: 1,
    link: 1,
  },
  "packages/modules/invoices/src/presentation/review-blocker.ts": {
    link: 2,
    links: 1,
  },
  "packages/modules/invoices/src/presentation/review-desk.tsx": {
    "not on the page": 2,
  },
  "packages/modules/invoices/src/presentation/review-fields.tsx": {
    unspecified: 1,
  },
  "packages/modules/invoices/src/presentation/review-pager.tsx": {
    "linked": 2,
    "not on the page": 1,
  },
  "packages/modules/invoices/src/services/ledger/allocations.ts": {
    link: 3,
    linked: 1,
  },
  "packages/modules/placeholder/src/module.ts": {
    enabled: 1,
  },
  "packages/modules/slides/src/agent-surface.ts": {
    agent: 1,
  },
  "packages/modules/slides/src/presentation/deck-list.tsx": {
    "chat is off": 2,
  },
  "packages/modules/slides/src/presentation/deck-view.tsx": {
    "remove slide": 1,
  },
  "packages/modules/slides/src/presentation/presenter-view.tsx": {
    "now showing": 1,
  },
  "packages/ui/src/list-header/filter-sheet.tsx": {
    "clear all": 1,
  },
} satisfies Record<string, Record<string, number>>;

/** The count of a `<path> <phrase>` key in a nested count record. */
function countOf(
  counts: Record<string, Record<string, number>>,
  key: string
): number | undefined {
  const split = key.indexOf(" ");

  return counts[key.slice(0, split)]?.[key.slice(split + 1)];
}

/** Tracked and untracked, unignored shipped source files of the scanned trees, by path. */
function shippedFiles(): ReadonlyMap<string, string> {
  const listed = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...SCANNED,
    ],
    { cwd: WORKSPACE_ROOT, encoding: "utf8" }
  );

  const paths = listed
    .split("\0")
    .filter((path) => SOURCE.test(path) && !NOT_SHIPPED.test(path))
    .filter((path) => !path.startsWith("customers/") || CUSTOMER_APP.test(path))
    .filter((path) => existsSync(join(WORKSPACE_ROOT, path)));

  return new Map(
    paths.map((path) => [
      path,
      readFileSync(join(WORKSPACE_ROOT, path), "utf8"),
    ])
  );
}

/** A glossary in the shape of `terminology.md`, with only the rows a fixture needs. */
function glossaryText(banned: string, exceptions = ""): string {
  return [
    "# Terminology",
    "",
    "## Banned words",
    "",
    "| Banned | Say instead | Applies in | Entry |",
    "| --- | --- | --- | --- |",
    banned,
    "",
    "## Allowed exceptions",
    "",
    "| Path | Banned | Reason |",
    "| --- | --- | --- |",
    exceptions,
    "",
    "## What the scan reads",
  ].join("\n");
}

const BANNED = [
  '| `agent`, `agents` | "Ask" | all | G1 |',
  '| `/\\bGenie\\b(?! Ops Center)/` | "Genie Ops Center" | all | G4 |',
  '| `disabled` | "Suspended" | `all` | G7 |',
  '| `link`, `linked` | "Allocate" | `packages/modules/invoices/` | G19 |',
].join("\n");

/** Every reported line of a scan over the given files. */
function report(
  files: Record<string, string>,
  glossary = readGlossary(glossaryText(BANNED))
): readonly string[] {
  return bannedHits(new Map(Object.entries(files)), glossary).hits.map(
    formatHit
  );
}

describe("the glossary scan", () => {
  it("reports a banned phrase in every kind of screen string, with path, line and the word to use", () => {
    const tsx = [
      "export function Panel({ name }: { name: string }) {",
      "  return (",
      '    <section aria-label="Agent panel">',
      "      <h2>Agent</h2>",
      "      <p>{`The agent read ${name}`}</p>",
      "    </section>",
      "  );",
      "}",
      'export const empty = "No agent yet";',
      'export const columns = [{ header: "Agent" }];',
      "export const Row = () => <b>agent</b>;",
    ].join("\n");

    const json = [
      "{",
      '  "panel": {',
      '    "title": "Agents"',
      "  }",
      "}",
    ].join("\n");

    expect(
      report({
        "packages/core/src/features/agent/panel.tsx": tsx,
        "apps/genie/src/messages/en.json": json,
      })
    ).toEqual([
      'packages/core/src/features/agent/panel.tsx:3: "agent" in "Agent panel". Say "Ask".',
      'packages/core/src/features/agent/panel.tsx:4: "agent" in "Agent". Say "Ask".',
      'packages/core/src/features/agent/panel.tsx:5: "agent" in "The agent read {}". Say "Ask".',
      'packages/core/src/features/agent/panel.tsx:9: "agent" in "No agent yet". Say "Ask".',
      'packages/core/src/features/agent/panel.tsx:10: "agent" in "Agent". Say "Ask".',
      'packages/core/src/features/agent/panel.tsx:11: "agent" in "agent". Say "Ask".',
      'apps/genie/src/messages/en.json:3: "agents" in "Agents". Say "Ask".',
    ]);
  });

  it("stays quiet on code: imports, types, keys, class lists, SQL, console calls and code tokens", () => {
    const ts = [
      'import { Agent } from "./Agent disabled";',
      'export { x } from "./Agent disabled";',
      'const lazy = import("./Agent disabled");',
      'type Mode = "Agent disabled";',
      'const keys = { "Agent disabled": 1 };',
      'const box = <div className="Agent disabled" />;',
      'const merged = cn("Agent disabled", ok && "Agent disabled");',
      'const buttonClassName = "Agent disabled";',
      "const query = sql`Agent is disabled`;",
      'const raw = "select agent, disabled from x";',
      'console.warn("Agent disabled");',
      'const token = "agent-disabled";',
      'const route = { path: "/agent/sessions/{sessionId}/disabled" };',
      "const GROUP_COLUMNS = `",
      '  g.id::text as "id",',
      "  (g.archived_at is not null) as disabled`;",
    ].join("\n");

    expect(report({ "packages/core/src/features/code.tsx": ts })).toEqual([]);
  });

  it("matches whole words and keeps the product name rule case-sensitive", () => {
    const ts = [
      'export const a = "An agentic flow";',
      'export const b = "Welcome to Genie Ops Center";',
      'export const c = "Welcome to Genie";',
    ].join("\n");

    expect(report({ "packages/ui/src/welcome.ts": ts })).toEqual([
      'packages/ui/src/welcome.ts:3: "/\\bGenie\\b(?! Ops Center)/" in "Welcome to Genie". Say "Genie Ops Center".',
    ]);
  });

  it("applies a scoped phrase only under its path", () => {
    const ts = 'export const label = "Linked payment";';

    expect(
      report({
        "packages/modules/invoices/src/payments.ts": ts,
        "packages/core/src/features/payments.ts": ts,
      })
    ).toEqual([
      'packages/modules/invoices/src/payments.ts:1: "linked" in "Linked payment". Say "Allocate".',
    ]);
  });

  it("hides only the excepted path and phrase, and names an exception or a scope that matches nothing", () => {
    const glossary = readGlossary(
      glossaryText(
        BANNED,
        [
          "| `packages/core/src/a.ts` | `agent` | model-facing tool text |",
          "| `packages/core/src/legacy/` | `agent` | model-facing tool text |",
          "| `packages/core/src/gone.ts` | `*` | model-facing tool text |",
        ].join("\n")
      )
    );

    const text = 'export const a = "Agent disabled";';

    const result = bannedHits(
      new Map([
        ["packages/core/src/a.ts", text],
        ["packages/core/src/legacy/c.ts", text],
        ["packages/core/src/b.ts", text],
      ]),
      glossary
    );

    expect(result.hits.map(formatHit)).toEqual([
      'packages/core/src/a.ts:1: "disabled" in "Agent disabled". Say "Suspended".',
      'packages/core/src/legacy/c.ts:1: "disabled" in "Agent disabled". Say "Suspended".',
      'packages/core/src/b.ts:1: "agent" in "Agent disabled". Say "Ask".',
      'packages/core/src/b.ts:1: "disabled" in "Agent disabled". Say "Suspended".',
    ]);
    expect(result.staleExceptions.map((rule) => rule.path)).toEqual([
      "packages/core/src/gone.ts",
    ]);
    // No scanned file sits under the invoices scope, so a typo there would switch the row off.
    expect(result.unusedScopes).toEqual(["packages/modules/invoices/"]);
  });

  it.each([
    [
      "a banned row without backticks",
      glossaryText('| agent | "Ask" | all | G1 |'),
      /no phrase in backticks/,
    ],
    [
      "an exception phrase the banned table lacks",
      glossaryText(BANNED, "| `packages/core/src/a.ts` | `agnet` | typo |"),
      /"agnet" is not a banned phrase/,
    ],
    [
      "an invalid regular expression",
      glossaryText('| `/(unclosed/` | "Ask" | all | G1 |'),
      /invalid regular expression/i,
    ],
    [
      "an Applies in cell that is neither all nor paths in backticks",
      glossaryText('| `agent` | "Ask" | packages/core/ | G1 |'),
      /Applies in "packages\/core\/" is neither all nor paths in backticks/,
    ],
    [
      "a scope path without a trailing slash",
      glossaryText('| `agent` | "Ask" | `packages/core` | G1 |'),
      /scope "packages\/core" must end in "\/"/,
    ],
    [
      "a missing section",
      glossaryText(BANNED).replace("## Allowed exceptions", "## Exceptions"),
      /missing the section "## Allowed exceptions"/,
    ],
  ])("refuses a glossary with %s", (_name, markdown, message) => {
    expect(() => readGlossary(markdown)).toThrow(message);
  });

  it("finds no banned word on screen outside the sweep ledger, and no stale exception", () => {
    const glossary = readGlossary(
      readFileSync(join(WORKSPACE_ROOT, GLOSSARY), "utf8")
    );

    const files = shippedFiles();

    // The scan must reach the trees and the table, or a green run proves nothing.
    expect(files.size).toBeGreaterThan(500);
    expect(glossary.banned.length).toBeGreaterThan(30);

    const { hits, staleExceptions, unusedScopes } = bannedHits(files, glossary);
    const counts: Record<string, Record<string, number>> = {};

    for (const { path, phrase } of hits) {
      const byPhrase = (counts[path] ??= {});

      byPhrase[phrase] = (byPhrase[phrase] ?? 0) + 1;
    }

    const pending = new Map(
      Object.entries(PENDING_SWEEP).flatMap(([path, byPhrase]) =>
        Object.entries(byPhrase).map(([phrase, count]) => [
          `${path} ${phrase}`,
          count,
        ])
      )
    );

    const unledgered = hits.filter(
      ({ path, phrase }) =>
        counts[path]?.[phrase] !== pending.get(`${path} ${phrase}`)
    );

    // A sweep that forgets to lower its row sees it here.
    const staleRows = [...pending].flatMap(([key, count]) => {
      const found = countOf(counts, key) ?? 0;

      return count > found
        ? [`stale ledger row: ${key} ledger ${count}, found ${found}`]
        : [];
    });

    expect(
      counts,
      [...unledgered.map(formatHit), ...staleRows].join("\n")
    ).toEqual(PENDING_SWEEP);
    expect(staleExceptions).toEqual([]);
    expect(unusedScopes).toEqual([]);
  });
});
