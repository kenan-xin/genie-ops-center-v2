import { describe, expect, it } from "vitest";

import { countInWindow, logsUntilOrThrow } from "./image-process.ts";

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
