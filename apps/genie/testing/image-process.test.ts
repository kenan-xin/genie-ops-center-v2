import { describe, expect, it } from "vitest";

import {
  SQL_SOURCES,
  asScannerSource,
  countInWindow,
  inventoryEntries,
  logsUntilOrThrow,
  scanCorpusForMigrationSql,
} from "./image-process.ts";

/**
 * Controls for the log barrier and the checkpoint window (the viewer
 * provider-count proof depends on both). A barrier that silently times out, or
 * a window whose checkpoint is not a prefix of the log, would let a provider
 * invocation be attributed to nobody and read as a measured zero. These
 * controls prove both failure modes fail loudly, and that a delayed line is
 * waited for rather than missed.
 */
class FakeImage {
  private lines: string[];

  constructor(lines: string[]) {
    this.lines = [...lines];
  }

  /** Grows the log once, to simulate a line that arrives late. */
  append(line: string): void {
    this.lines.push(line);
  }

  logs = async (): Promise<string> => this.lines.join("\n") + "\n";
}

describe("the log barrier", () => {
  it("resolves once the marker arrives", async () => {
    const image = new FakeImage(['{"msg":"request"}']);

    setTimeout(() => image.append('{"requestId":"late-1"}'), 300);

    const logs = await logsUntilOrThrow(image, '"requestId":"late-1"', 5000);

    expect(logs).toContain('"requestId":"late-1"');
  });

  it("throws when the marker never arrives instead of returning a non-matching log", async () => {
    const image = new FakeImage(['{"msg":"request"}']);

    await expect(
      logsUntilOrThrow(image, '"requestId":"never-1"', 600)
    ).rejects.toThrow(/never observed/);
  });
});

describe("the migration SQL scanner", () => {
  const [source] = SQL_SOURCES;

  // Positives carry the repository's own migration SQL raw, as a JSON-escaped
  // string literal and as base64; negatives carry unrelated SQL the same ways.
  // The scanner matches this repository's migrations, not SQL in general.
  it("detects the repository migration SQL raw, JSON-escaped and base64 encoded, and only that SQL", () => {
    expect(source).toBeDefined();

    // The RAW repository SQL, not the normalized form: normalization strips
    // the newlines and tabs the escaped encoding must be proven against.
    const sql = source === undefined ? "" : source.raw;
    const unrelated = "insert into f2_control values (1);\nselect 1;";

    const corpus = new Map([
      ["/_next/static/media/real.sql", sql],
      ["/_next/static/chunks/escaped.js", `const m=${JSON.stringify(sql)};`],
      [
        "/_next/static/chunks/base64.js",
        `const m=${JSON.stringify(Buffer.from(sql).toString("base64"))};`,
      ],
      [
        "/_next/static/chunks/unrelated.js",
        `const m=${JSON.stringify(unrelated)};`,
      ],
      ["/f2-negative.sql", unrelated],
    ]);

    expect(scanCorpusForMigrationSql(corpus).toSorted()).toEqual(
      [
        "/_next/static/media/real.sql",
        "/_next/static/chunks/escaped.js",
        "/_next/static/chunks/base64.js",
      ].toSorted()
    );
  });

  it("fails closed when a migration SQL file is empty", () => {
    // Empty: malformed, and a contract with no needle is vacuous.
    expect(() => asScannerSource("f2", "0000_tiny", "")).toThrow(/empty/);

    // Short but real: legal, and covered by the same containment scan.
    expect(asScannerSource("f2", "0000_tiny", "select 1").normalized).toBe(
      "select 1"
    );
  });

  it("rejects symlinked public corpus entries with a named diagnostic", () => {
    // An inventory that skipped links would be incomplete, and one that
    // followed them could leave the static roots.
    const link =
      '{"symlink":"/app/apps/genie/public/linked.sql","target":"/outside/x.sql"}';

    // The named diagnostic, not the generic malformed-line error, which would
    // also quote the link's JSON.
    expect(() => inventoryEntries(link)).toThrow(/contains a symlink/);
    expect(() =>
      inventoryEntries(
        `${link}\n{"url":"/_next/static/chunks/a.js","b64":"aGk="}`
      )
    ).toThrow(/contains a symlink/);
    expect(
      inventoryEntries('{"url":"/_next/static/chunks/a.js","b64":"aGk="}')
    ).toEqual([{ url: "/_next/static/chunks/a.js", b64: "aGk=" }]);
  });

  it("fails closed when a body exceeds the literal budget", () => {
    const flooded = new Map([
      ["_next/static/chunks/flooded.js", '"a"'.repeat(25001)],
    ]);

    expect(() => scanCorpusForMigrationSql(flooded)).toThrow(
      /25000-literal budget/
    );
  });
});

describe("the checkpoint window", () => {
  const marker = '"requestId":"sentinel-1"';
  const needle = "frame origin provider invoked";

  it("counts only the lines between the checkpoint and the barrier", () => {
    const checkpoint = `bootstrap complete\n${needle}\n`;

    const logs =
      checkpoint +
      `${needle}\n` + // the target request's invocation, inside the window
      `{"requestId":"target-1"}\n` +
      `${marker}\n` + // the barrier: nothing after it belongs to the target
      `${needle}\n`;

    expect(countInWindow(logs, checkpoint, marker, needle)).toBe(1);
  });

  it("counts zero when the window holds no invocation", () => {
    const checkpoint = "bootstrap complete\n";
    const logs = `bootstrap complete\n{"requestId":"target-1"}\n${marker}\n`;

    expect(countInWindow(logs, checkpoint, marker, needle)).toBe(0);
  });

  it("throws when the checkpoint is not a prefix of the log", () => {
    const checkpoint = "bootstrap complete\n";
    const logs = `rotated away\n${marker}\n`;

    expect(() => countInWindow(logs, checkpoint, marker, needle)).toThrow(
      /not append-only/
    );
  });

  it("throws when the barrier marker is absent", () => {
    const checkpoint = "bootstrap complete\n";
    const logs = "bootstrap complete\n";

    expect(() => countInWindow(logs, checkpoint, marker, needle)).toThrow(
      /barrier marker is absent/
    );
  });
});
