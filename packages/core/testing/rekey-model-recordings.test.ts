import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, expect, it } from "vitest";

import type { JsonValue, ModelRecording } from "./model-transports.ts";
import {
  loadModelRecordings,
  replayModelTransport,
} from "./model-transports.ts";

const TOOL = fileURLToPath(
  new URL("../tools/rekey-model-recordings.ts", import.meta.url)
);

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

// A newline and quotes, so the edit must match the file's JSON escaping.
const OLD_PROMPT = 'Old "prompt".\nLine two';

const NEW_PROMPT = "New prompt";

function bodyWith(system: string) {
  return {
    model: "m",
    messages: [
      { role: "system", content: system },
      { role: "user", content: "Hi" },
    ],
  } satisfies JsonValue;
}

function recording(name: string, system: string): ModelRecording {
  return {
    name,
    request: { method: "POST", url: CHAT_URL, body: bodyWith(system) },
    // The answer echoes the old prompt; a re-key must never touch it.
    response: { status: 200, body: { echo: OLD_PROMPT } },
  };
}

function responsePart(text: string): string {
  return text.slice(text.indexOf('\n  "response": {'));
}

let folder = "";

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "rekey-"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function write(name: string, value: ModelRecording): string {
  const path = join(folder, `${name}.json`);

  writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`, "utf8");

  return path;
}

type Edit = { readonly find: string; readonly replace: string };

function rekey(edits: readonly Edit[], ...args: string[]) {
  const editsPath = join(folder, "edits.json.txt");

  writeFileSync(editsPath, JSON.stringify(edits), "utf8");

  return spawnSync(process.execPath, [TOOL, editsPath, ...args], {
    encoding: "utf8",
  });
}

it("re-keys a recording after a prompt edit, keeps its response bytes, and lists only what changed", async () => {
  const broken = write("broken", recording("broken", OLD_PROMPT));
  const other = write("other", recording("other", "Another prompt"));
  const before = readFileSync(broken, "utf8");
  const otherMtime = statSync(other).mtimeMs;
  const list = join(folder, "to-refresh.txt");

  writeFileSync(list, "earlier.json\n", "utf8");

  const run = rekey(
    [{ find: OLD_PROMPT, replace: NEW_PROMPT }],
    "--refresh-list",
    list,
    folder
  );

  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  expect(run.stdout).toBe(`${broken}\nre-keyed 1 recordings\n`);
  expect(readFileSync(list, "utf8")).toBe(`earlier.json\n${broken}\n`);

  const after = readFileSync(broken, "utf8");

  expect(responsePart(after)).toBe(responsePart(before));
  expect(statSync(other).mtimeMs).toBe(otherMtime);

  const send = replayModelTransport(loadModelRecordings(folder));

  const post = (system: string) =>
    send(CHAT_URL, { method: "POST", body: JSON.stringify(bodyWith(system)) });

  await expect((await post(NEW_PROMPT)).json()).resolves.toEqual({
    echo: OLD_PROMPT,
  });
  await expect(post(OLD_PROMPT)).rejects.toThrow("No recording answers");
});

it("stops and writes nothing when an edit matches no recording or matches one twice", () => {
  const broken = write("broken", recording("broken", OLD_PROMPT));
  const twice = recording("twice", OLD_PROMPT);
  const before = readFileSync(broken, "utf8");

  const unmatched = rekey(
    [
      { find: OLD_PROMPT, replace: NEW_PROMPT },
      { find: "not in any request", replace: "x" },
    ],
    folder
  );

  expect(unmatched.status).toBe(1);
  expect(unmatched.stderr).toContain("not in any request");
  expect(readFileSync(broken, "utf8")).toBe(before);

  const doubled = write("twice", {
    ...twice,
    request: {
      ...twice.request,
      body: { ...bodyWith(OLD_PROMPT), note: OLD_PROMPT },
    },
  });

  const doubledBefore = readFileSync(doubled, "utf8");

  const ambiguous = rekey([{ find: OLD_PROMPT, replace: NEW_PROMPT }], folder);

  expect(ambiguous.status).toBe(1);
  expect(ambiguous.stderr).toContain("2 matches");
  expect(readFileSync(broken, "utf8")).toBe(before);
  expect(readFileSync(doubled, "utf8")).toBe(doubledBefore);
});
