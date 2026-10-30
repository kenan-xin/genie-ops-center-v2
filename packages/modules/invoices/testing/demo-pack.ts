import { readFileSync } from "node:fs";

/**
 * The demo pack at `docs/modules/invoices-and-payments/demo-pack/`. A test reads its expected
 * files, and `seedDemoHistory` saves its history through the procedures a person uses, so the
 * demo figures are proven on the real path and no test restates a module formula.
 */
export const DEMO_PACK = new URL(
  "../../../../docs/modules/invoices-and-payments/demo-pack/",
  import.meta.url
);

// oxlint-disable-next-line anti-slop/no-unknown-returns -- the pack's files have different shapes, and each caller parses the one it reads.
export function readDemoJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, DEMO_PACK), "utf8"));
}

/**
 * A demo CSV as records. The header row names the columns, and no demo CSV holds a quoted comma,
 * so a plain split reads it. A blank cell stays an empty string, as the pack's blanks map to null.
 */
export function readDemoCsv(
  path: string
): readonly Readonly<Record<string, string>>[] {
  const [header = "", ...lines] = readFileSync(new URL(path, DEMO_PACK), "utf8")
    .trimEnd()
    // The pack's CSVs end their lines with a carriage return and a newline.
    .split(/\r?\n/);

  const names = header.split(",");

  return lines.map((line) => {
    const values = line.split(",");

    return Object.fromEntries(
      names.map((name, index) => [name, values[index] ?? ""])
    );
  });
}

/** Demo pack amounts are dollars with up to two decimals; the module holds integer cents. */
export function toCents(dollars: number): number {
  const cents = Math.round(dollars * 100);

  if (!Number.isSafeInteger(cents)) {
    throw new Error(
      `The demo amount ${dollars} is not a safe number of cents.`
    );
  }

  return cents;
}

/** The demo id of each saved record to its row id, so a test can join the pack's expected files. */
export type DemoHistoryIds = {
  readonly customers: ReadonlyMap<string, string>;
  readonly invoices: ReadonlyMap<string, string>;
  readonly payments: ReadonlyMap<string, string>;
};
