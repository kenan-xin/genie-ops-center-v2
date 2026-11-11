/**
 * Re-keys model recordings after a prompt or tool-description edit (DEC-55). It edits the request
 * part of each recording as text, above the line `  "response": {`, so every response stays
 * byte-equal. It calls no model and reads no key. A re-keyed recording still answers with the old
 * prompt's response, so `--refresh-list` appends its path to the list the owner refreshes later.
 *
 *   node packages/core/tools/rekey-model-recordings.ts <edits.json> [--refresh-list <file>] <recording file or folder>...
 *
 * edits.json: [{ "find": "old text", "replace": "new text", "raw": false }]. Without `raw`, both are
 * decoded text and match in their JSON string escaping. With `raw`, they match the file's own text
 * (for a whole tool entry). In each file an edit matches once or not at all: two matches stop the
 * run, and so does an edit that matches no file. A stopped run writes nothing.
 */
import {
  appendFileSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

const editsSchema = z.array(
  z.object({
    find: z.string().min(1),
    replace: z.string(),
    raw: z.boolean().optional(),
  })
);

const RESPONSE_LINE = '\n  "response": {';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "refresh-list": { type: "string" } },
});

const [editsPath, ...paths] = positionals;

if (editsPath === undefined || paths.length === 0) {
  fail(
    "Usage: node packages/core/tools/rekey-model-recordings.ts <edits.json> [--refresh-list <file>] <recording file or folder>..."
  );
}

const edits = editsSchema.parse(JSON.parse(readFileSync(editsPath, "utf8")));

const files = paths.flatMap((path) =>
  statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((file) => file.endsWith(".json"))
        .toSorted()
        .map((file) => join(path, file))
    : [path]
);

const texts = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));

const changed = new Set<string>();

for (const edit of edits) {
  // JSON.stringify writes a string value the way the recording files hold it.
  const find =
    edit.raw === true ? edit.find : JSON.stringify(edit.find).slice(1, -1);

  const replace =
    edit.raw === true
      ? edit.replace
      : JSON.stringify(edit.replace).slice(1, -1);

  let matched = false;

  for (const [file, text] of texts) {
    const cut = text.indexOf(RESPONSE_LINE);

    if (cut === -1) {
      fail(`${file} has no response line. Nothing was written.`);
    }

    const request = text.slice(0, cut);
    const count = request.split(find).length - 1;

    if (count === 0) {
      continue;
    }

    if (count > 1) {
      fail(
        `${count} matches in the request of ${file} for ${JSON.stringify(edit.find.slice(0, 80))}. Make the find text unique. Nothing was written.`
      );
    }

    texts.set(file, request.replace(find, () => replace) + text.slice(cut));
    changed.add(file);
    matched = true;
  }

  if (!matched) {
    fail(
      `No request holds ${JSON.stringify(edit.find.slice(0, 80))}. Nothing was written.`
    );
  }
}

for (const file of changed) {
  try {
    JSON.parse(texts.get(file) ?? "");
  } catch (error) {
    fail(
      `The edits leave ${file} unparseable (${error instanceof Error ? error.message : String(error)}). Nothing was written.`
    );
  }
}

// The list first: if a write fails after it, the list names too many files, never too few.
if (values["refresh-list"] !== undefined && changed.size > 0) {
  appendFileSync(
    values["refresh-list"],
    [...changed].map((file) => `${file}\n`).join(""),
    "utf8"
  );
}

for (const file of changed) {
  writeFileSync(file, texts.get(file) ?? "", "utf8");
  console.log(file);
}

console.log(`re-keyed ${changed.size} recordings`);
