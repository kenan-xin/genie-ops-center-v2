import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type SourceText,
  analyseSource,
  catalogueLeafKeys,
  catalogueViolations,
  productionSources,
} from "./catalogue-coverage.ts";

// A dynamic import for the same reason `request.ts` uses one: this package's
// `module` is `nodenext`, which demands an import attribute on a static import.
const en = (await import("../messages/en.json")).default;

/** The folder the real scan reads: the application's own sources. */
const APP_SOURCE_ROOT = join(import.meta.dirname, "..");

/**
 * The catalogue check, in two halves.
 *
 * The fixtures below are strings this suite owns, not files on disk, so each
 * failure mode is proved on a source written for it. They are what makes the
 * real-tree case at the bottom worth anything: a checker that returned an empty
 * array for every input would pass that case and fail every one of these.
 *
 * The analysis is deliberately narrow. It supports the shapes inventoried
 * across `apps/genie/src` on 2026-09-22 and reports everything else, so a new
 * next-intl API or a computed key fails the run rather than passing unread.
 */
function fixture(text: string): readonly SourceText[] {
  return [{ path: "app/fixture.tsx", text }];
}

const SERVER_PAGE = `
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("app");

  return <h1>{t("title")}</h1>;
}
`;

describe("reading catalogue keys out of a source file", () => {
  it("reads the shape every server component in this app uses", () => {
    const analysis = analyseSource("app/page.tsx", SERVER_PAGE);

    expect(analysis.violations).toEqual([]);
    expect(analysis.keys).toEqual(["app.title"]);
  });

  it("reads the client shape, which binds without an await", () => {
    const analysis = analyseSource(
      "app/probe.tsx",
      `import { useTranslations } from "next-intl";

export function Probe() {
  const t = useTranslations("viewer");

  return <span>{t("heading")}</span>;
}
`
    );

    expect(analysis.violations).toEqual([]);
    expect(analysis.keys).toEqual(["viewer.heading"]);
  });

  // The binding, not the name, is what this check follows.
  it("follows an aliased import to the factory it really names", () => {
    const analysis = analyseSource(
      "app/page.tsx",
      `import { getTranslations as load } from "next-intl/server";

export default async function Page() {
  const message = await load("access");

  return <p>{message("denied")}</p>;
}
`
    );

    expect(analysis.violations).toEqual([]);
    expect(analysis.keys).toEqual(["access.denied"]);
  });

  it("ignores a local helper that happens to be called t", () => {
    const analysis = analyseSource(
      "app/page.tsx",
      `import { getTranslations } from "next-intl/server";

function t(label: string) {
  return label.toUpperCase();
}

export default async function Page() {
  const copy = await getTranslations("app");

  return <h1>{copy("title")}{t("not a catalogue key")}</h1>;
}
`
    );

    expect(analysis.violations).toEqual([]);
    expect(analysis.keys).toEqual(["app.title"]);
  });
});

describe("shapes this check refuses to read", () => {
  it("reports a key that is not a literal", () => {
    const analysis = analyseSource(
      "app/page.tsx",
      `import { getTranslations } from "next-intl/server";

export default async function Page(props: { readonly name: string }) {
  const t = await getTranslations("app");

  return <h1>{t(props.name)}</h1>;
}
`
    );

    expect(analysis.keys).toEqual([]);
    expect(analysis.violations).toHaveLength(1);
    expect(analysis.violations[0]).toMatch(/key is not one string literal/);
  });

  it("reports a namespace that is not a literal", () => {
    const analysis = analyseSource(
      "app/page.tsx",
      `import { getTranslations } from "next-intl/server";

export default async function Page(props: { readonly space: string }) {
  const t = await getTranslations(props.space);

  return <h1>{t("title")}</h1>;
}
`
    );

    expect(analysis.keys).toEqual([]);
    expect(analysis.violations[0]).toMatch(
      /namespace is not one string literal/
    );
  });

  it("reports a translator handed round as a value", () => {
    const analysis = analyseSource(
      "app/page.tsx",
      `import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("app");

  return <Heading translate={t} />;
}
`
    );

    expect(analysis.keys).toEqual([]);
    expect(analysis.violations[0]).toMatch(/used as a value/);
  });

  it("reports a translator member call, such as the rich-text form", () => {
    const analysis = analyseSource(
      "app/page.tsx",
      `import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("app");

  return <h1>{t.rich("title")}</h1>;
}
`
    );

    expect(analysis.keys).toEqual([]);
    expect(analysis.violations[0]).toMatch(/used as a value/);
  });

  it("reports a next-intl import outside the inventory", () => {
    const analysis = analyseSource(
      "app/page.tsx",
      `import { useFormatter } from "next-intl";

export function Stamp() {
  return <time>{useFormatter().dateTime(new Date())}</time>;
}
`
    );

    expect(analysis.violations[0]).toMatch(
      /"useFormatter" is imported from "next-intl"/
    );
  });

  it("reports a namespace import, which hides every key reached through it", () => {
    const analysis = analyseSource(
      "app/page.tsx",
      `import * as intl from "next-intl/server";

export default async function Page() {
  const t = await intl.getTranslations("app");

  return <h1>{t("title")}</h1>;
}
`
    );

    expect(analysis.keys).toEqual([]);
    expect(analysis.violations[0]).toMatch(/namespace import/);
  });

  it("reports a factory called outside a variable declaration", () => {
    const analysis = analyseSource(
      "app/page.tsx",
      `import { getTranslations } from "next-intl/server";

export default async function Page() {
  return <h1>{(await getTranslations("app"))("title")}</h1>;
}
`
    );

    expect(analysis.keys).toEqual([]);
    expect(analysis.violations[0]).toMatch(
      /called outside a variable declaration/
    );
  });

  it("reports a translator name that is declared a second time", () => {
    const analysis = analyseSource(
      "app/page.tsx",
      `import { getTranslations } from "next-intl/server";

function shout(t: string) {
  return t.toUpperCase();
}

export default async function Page() {
  const t = await getTranslations("app");

  return <h1>{shout(t("title"))}</h1>;
}
`
    );

    expect(
      analysis.violations.some((line) => /declared again/.test(line))
    ).toBe(true);
  });

  it("reports one namespace bound twice to the same name", () => {
    const analysis = analyseSource(
      "app/page.tsx",
      `import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("app");
  const t = await getTranslations("viewer");

  return <h1>{t("title")}</h1>;
}
`
    );

    expect(analysis.violations.some((line) => /ambiguous/.test(line))).toBe(
      true
    );
  });
});

describe("comparing references against the catalogue", () => {
  it("flattens the catalogue to fully qualified leaf keys", () => {
    expect(
      catalogueLeafKeys({ app: { title: "Genie" }, access: "flat" })
    ).toEqual(["access", "app.title"]);
  });

  it("fails on a key the catalogue does not hold", () => {
    const violations = catalogueViolations(fixture(SERVER_PAGE), {
      app: { other: "Something else" },
    });

    expect(violations).toContain(
      "app.title is read from the catalogue and is not in it. Add the message or correct the key."
    );
  });

  it("fails on a catalogue entry no source reads", () => {
    const violations = catalogueViolations(fixture(SERVER_PAGE), {
      app: { title: "Genie Ops Center", orphan: "Nobody reads this" },
    });

    expect(violations).toEqual([
      "app.orphan is in the catalogue and no application source reads it. Delete the message or use it.",
    ]);
  });

  it("reports nothing when the references and the catalogue agree exactly", () => {
    expect(
      catalogueViolations(fixture(SERVER_PAGE), {
        app: { title: "Genie Ops Center" },
      })
    ).toEqual([]);
  });
});

describe("the application's own sources against the English catalogue", () => {
  const sources = productionSources(APP_SOURCE_ROOT);

  it("scans real application sources, so an empty scan cannot pass", () => {
    expect(sources.length).toBeGreaterThan(5);
    expect(sources.map((source) => source.path)).toContain("app/page.tsx");
  });

  it("reads no test, story or fixture file", () => {
    for (const { path } of sources) {
      expect(path).not.toMatch(/\.(?:test|stories)\.tsx?$/);
      expect(path).not.toContain("__fixtures__");
    }
  });

  it("holds a catalogue that is not empty, or the comparison proves nothing", () => {
    expect(catalogueLeafKeys(en).length).toBeGreaterThan(0);
  });

  // The acceptance clause itself: every string the application renders resolves
  // through the catalogue, and the catalogue carries nothing it does not render.
  it("resolves every referenced key and leaves no catalogue entry unread", () => {
    expect(catalogueViolations(sources, en)).toEqual([]);
  });
});
