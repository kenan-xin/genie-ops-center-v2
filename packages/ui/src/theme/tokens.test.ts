import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  categoryColors,
  categoryChipClasses,
  chartColors,
  colorRoles,
  controlHeights,
  controlHeightsPx,
  denseRowHeight,
  focusRing,
  groupControlHeights,
  iconControlSizes,
  minTouchHeight,
  rowHeight,
  spacingPx,
  touchAreaPx,
  touchAreas,
  touchAreaY,
  touchRowHeight,
} from "./tokens.ts";

function linear(value: number): number {
  const unit = value / 255;

  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function channel(digits: string, at: number): number {
  return linear(Number.parseInt(digits.slice(at, at + 2), 16));
}

/** WCAG 2.1 relative luminance of an `#rrggbb` color. */
function luminance(hex: string): number {
  const digits = hex.replace("#", "");

  return (
    0.2126 * channel(digits, 0) +
    0.7152 * channel(digits, 2) +
    0.0722 * channel(digits, 4)
  );
}

function contrastRatio(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

type Oklab = { readonly l: number; readonly a: number; readonly b: number };

/** OKLab of an `#rrggbb` color, for a perceptual distance between two colors. */
function oklab(hex: string): Oklab {
  const digits = hex.replace("#", "");
  const r = channel(digits, 0);
  const g = channel(digits, 2);
  const b = channel(digits, 4);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function distance(a: string, b: string): number {
  const x = oklab(a);
  const y = oklab(b);

  return 100 * Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}

describe("the fixed token layer against tokens.md", () => {
  // czjw.65 (I6): a placeholder must read, but never as a value the person entered.
  it("keeps the placeholder readable on the card and apart from the value text", () => {
    for (const theme of ["light", "dark"] as const) {
      const roles = colorRoles[theme];

      expect(
        contrastRatio(roles.placeholder, roles.card)
      ).toBeGreaterThanOrEqual(4.5);
    }

    expect(
      contrastRatio(colorRoles.light.foreground, colorRoles.light.placeholder)
    ).toBeGreaterThanOrEqual(3);
  });

  it("holds the one focus ring, colored only through --ring (R-8)", () => {
    expect(focusRing).toBe(
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    );
  });
});

/** The Tailwind spacing step of a px value. */
const step = (px: number) => px / spacingPx;

/** The spacing step of an input group's control: `px` less the group's two 1 px borders. */
const inner = (px: number) => step(px - 2);

/** The product source files: the scans below and the test target's Nx inputs (6wz1.135). */
const PRODUCT_SOURCES = [
  "packages/*/src/**/*.{ts,tsx}",
  "packages/modules/*/src/**/*.{ts,tsx}",
  "apps/genie/src/**/*.{ts,tsx}",
  "customers/*/app/**/*.{ts,tsx}",
] as const;

/** A hand-set control height, behind any variant: the classes `controlHeights` owns (6wz1.114). */
const CONTROL_HEIGHT = /(?<=^|[\s"'`:])(?:min-)?h-(?:9|10|11)(?![\w./-])/gm;

function found(source: string): string[] {
  return [...source.matchAll(CONTROL_HEIGHT)].map(([match]) => match);
}

/**
 * Hits of `CONTROL_HEIGHT` that size something other than a control, with the number of hits each
 * row expects in its file, so a row never exempts a later control with the same class.
 */
const NOT_A_CONTROL: readonly (readonly [
  path: string,
  className: string,
  count: number,
  reason: string,
])[] = [
  [
    "packages/modules/slides/src/presentation/slide-editor.tsx",
    "h-9",
    1,
    "czjw.180, edit-slide.prototype.html: the 56 x 36 px thumbnail of a Charts and images row is a picture tile, not a control",
  ],
  [
    "packages/core/src/features/shell/offline-bar.tsx",
    "min-h-10",
    1,
    "the offline banner is a status bar, not a control",
  ],
  [
    "packages/core/src/features/roles/roles-screen.tsx",
    "min-h-9",
    1,
    "the legend bar of a permission group is a caption, not a control",
  ],
  [
    "packages/core/src/features/shell/page-skeleton.tsx",
    "h-11",
    1,
    "a loading placeholder block of a list row, not a control",
  ],
  [
    "packages/ui/src/parts/transfer-list.tsx",
    "min-h-11",
    1,
    "the band over a side holds its caption and an sm button with its own touch area; the band takes no tap",
  ],
  [
    "packages/core/src/features/groups/groups-screen.tsx",
    "min-h-11",
    1,
    "the members count band holds a caption and a Button; the band takes no tap",
  ],
  [
    "packages/modules/analytics/src/presentation/filters-bar.tsx",
    "min-h-11",
    1,
    "the summary band under the phone filters holds text and a Button; the band takes no tap",
  ],
  [
    "packages/ui/src/components/tabs.tsx",
    "h-11",
    1,
    "the card-top list sets its triggers to controlHeights.lg through a child selector, which a token class cannot carry",
  ],
  [
    "packages/ui/src/components/tabs.tsx",
    "min-h-11",
    1,
    "the card-top list sets its triggers to controlHeights.lg through a child selector, which a token class cannot carry",
  ],
];

// 6wz1.114, owner: 36 px from lg, 40 px visible under it with a 44 px touch area, 32 px dense.
describe("the control heights against tokens.md, Control heights", () => {
  const { sm, md, lg } = controlHeightsPx;

  it("gives buttons and fields one md height: 36 px from lg, 40 px under it", () => {
    expect(controlHeightsPx).toEqual({
      sm: 32,
      md: { desktop: 36, phone: 40 },
      lg: 44,
    });

    expect(controlHeights).toEqual({
      sm: `h-${step(sm)} min-h-${step(sm)}`,
      md: `h-${step(md.phone)} min-h-${step(md.phone)} lg:h-${step(md.desktop)} lg:min-h-${step(md.desktop)}`,
      lg: `h-${step(lg)} min-h-${step(lg)}`,
    });
    expect(iconControlSizes).toEqual({
      sm: `size-${step(sm)}`,
      md: `size-${step(md.phone)} lg:size-${step(md.desktop)}`,
    });
    expect(rowHeight).toBe(
      `min-h-${step(touchAreaPx)} lg:min-h-${step(md.desktop)}`
    );
    expect(denseRowHeight).toBe(
      `min-h-${step(touchAreaPx)} lg:min-h-${step(sm)}`
    );
    expect(touchRowHeight).toBe(`min-h-${step(touchAreaPx)} lg:min-h-0`);
    expect(minTouchHeight).toBe(`min-h-${step(touchAreaPx)}`);
  });

  it("reaches a 44 px touch area from each size, under the control's own content", () => {
    expect(touchAreaPx).toBe(44);
    const area = step(touchAreaPx);

    expect(touchAreas).toEqual({
      sm: `relative isolate after:absolute after:top-1/2 after:left-1/2 after:-z-10 after:size-full after:min-h-${area} after:min-w-${area} after:-translate-1/2`,
      md: `relative isolate max-lg:after:absolute max-lg:after:top-1/2 max-lg:after:left-1/2 max-lg:after:-z-10 max-lg:after:size-full max-lg:after:min-h-${area} max-lg:after:min-w-${area} max-lg:after:-translate-1/2`,
    });
    expect(touchAreaY).toBe(
      `relative isolate max-lg:before:absolute max-lg:before:inset-x-0 max-lg:before:top-1/2 max-lg:before:-z-10 max-lg:before:h-full max-lg:before:min-h-${area} max-lg:before:-translate-y-1/2`
    );
  });

  it("sizes an input group's control to its control height less the group's two 1 px borders", () => {
    expect(groupControlHeights).toEqual({
      sm: `h-${inner(sm)} min-h-${inner(sm)}`,
      md: `h-${inner(md.phone)} min-h-${inner(md.phone)} lg:h-${inner(md.desktop)} lg:min-h-${inner(md.desktop)}`,
      lg: `h-${inner(lg)} min-h-${inner(lg)}`,
    });
  });

  it("finds a control height behind any variant, and nothing that only looks like one", () => {
    for (const source of [
      "h-9",
      "h-10",
      "min-h-10",
      "lg:min-h-10",
      "md:min-h-10",
      "lg:h-9",
      "data-[size=lg]:lg:min-h-10",
      "h-10!",
      "`flex h-10 ${x}`",
      "min-h-11",
      "lg:h-11",
      "max-lg:min-h-11",
    ]) {
      expect(found(source), source).toHaveLength(1);
    }

    for (const source of ["h-10.5", "h-8.5", "max-h-10", "size-10", "h-100"]) {
      expect(found(source), source).toEqual([]);
    }
  });

  it("leaves no hand-set control height outside the tokens", () => {
    const root = join(import.meta.dirname, "../../../..");

    const files = globSync(PRODUCT_SOURCES, { cwd: root }).filter(
      (file) =>
        !/\.(test|stories)\.|\/testing\/|\/__fixtures__\//.test(file) &&
        // tokens.ts defines the classes.
        file !== "packages/ui/src/theme/tokens.ts"
    );

    const hits = files.flatMap((file) =>
      found(readFileSync(join(root, file), "utf8")).map(
        (match) => `${file} ${match}`
      )
    );

    const allowed = new Set(
      NOT_A_CONTROL.map(([path, className]) => `${path} ${className}`)
    );

    expect(files.length).toBeGreaterThan(100);

    expect(hits.filter((hit) => !allowed.has(hit))).toEqual([]);

    // The exact count: an extra hit in an exempt file is a new control, a missing one a stale row.
    for (const [path, className, count] of NOT_A_CONTROL) {
      const row = `${path} ${className}`;

      expect(
        hits.filter((hit) => hit === row),
        `hits of row: ${row}`
      ).toHaveLength(count);
    }
  });

  it("lists the same sources as the Nx inputs of the test target", () => {
    // SAFETY: packages/ui/package.json declares nx.targets.test.inputs; a missing key fails the test.
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dirname, "../../package.json"), "utf8")
    ) as { nx: { targets: { test: { inputs: string[] } } } };

    for (const glob of PRODUCT_SOURCES) {
      expect(manifest.nx.targets.test.inputs).toContain(
        `{workspaceRoot}/${glob}`
      );
    }
  });

  it("states the md height in DESIGN.md's front matter", () => {
    const design = readFileSync(
      join(import.meta.dirname, "../../../..", "DESIGN.md"),
      "utf8"
    );

    const lines = design.split("\n");
    const open = lines.indexOf("---");
    const front = lines.slice(open + 1, lines.indexOf("---", open + 1));

    for (const name of [
      "button-primary",
      "button-secondary",
      "button-danger",
      "input",
      "nav-row-active",
    ]) {
      const start = front.indexOf(`  ${name}:`);

      const height = front
        .slice(start + 1)
        .find((line) => /^\s+height: "\d+px"$/.test(line));

      expect(start, name).toBeGreaterThanOrEqual(0);
      expect(height?.trim(), name).toBe(`height: "${md.desktop}px"`);
    }
  });
});

/** The mono face as a class, behind any variant (A-7, 6wz1.124). */
const MONO_FACE = /(?<=^|[\s"'`:])font-mono(?![\w-])/gm;

/**
 * The files that keep the mono face for an id, a key or a code (P04-6), with their hit count, so a
 * row never exempts a later label in the same file.
 */
const MONO_FOR_IDS: readonly (readonly [
  path: string,
  count: number,
  reason: string,
])[] = [
  ["apps/genie/src/setup/not-set-up-page.tsx", 1, "a setup command"],
  [
    "packages/core/src/features/audit/audit-event-sheet.tsx",
    4,
    "event ids, action codes and the raw event",
  ],
  [
    "packages/core/src/features/branding/colors-tab.tsx",
    1,
    "the hex value of the computed foreground",
  ],
  [
    "packages/core/src/features/break-glass/break-glass-account.tsx",
    3,
    "one-time and recovery codes",
  ],
  [
    "packages/core/src/features/break-glass/break-glass-sign-in.tsx",
    2,
    "one-time and recovery codes",
  ],
  [
    "packages/core/src/features/modules/modules-screen.tsx",
    2,
    "the module id and an issue path (Modules spec line 25, O-2)",
  ],
  [
    "packages/ui/src/parts/pills.tsx",
    1,
    "the audit action code chip, CategoryChip",
  ],
];

// A-7, owner: monospace only for ids and keys; counts, pagers, money and dates use the page font.
describe("the mono face against A-7", () => {
  it("keeps the mono face for ids, keys and codes", () => {
    const root = join(import.meta.dirname, "../../../..");

    const hits = globSync(PRODUCT_SOURCES, { cwd: root })
      .filter(
        (file) => !/\.(test|stories)\.|\/testing\/|\/__fixtures__\//.test(file)
      )
      .flatMap((file) => {
        const count =
          readFileSync(join(root, file), "utf8").match(MONO_FACE)?.length ?? 0;

        return count === 0 ? [] : [[file, count] as const];
      });

    expect(Object.fromEntries(hits)).toEqual(
      Object.fromEntries(MONO_FOR_IDS.map(([path, count]) => [path, count]))
    );
  });
});

/** Bottom bars in main-lane files that still lack the inset, routed to `genie-ops-center-v2-6wz1.145`. */
const BOTTOM_BARS_WITHOUT_INSET = [
  "packages/core/src/features/access/grants-screen.tsx",
  "packages/modules/invoices/src/presentation/document-desk.tsx",
  "packages/modules/invoices/src/presentation/review-form.tsx",
  "packages/modules/invoices/src/presentation/review-pager.tsx",
];

// P16e-47: with `viewport-fit=cover`, the home indicator covers a bottom bar without the inset.
describe("the safe-area inset against P16e-47", () => {
  it("keeps the home indicator's room under every bottom bar", () => {
    const root = join(import.meta.dirname, "../../../..");

    const bare = globSync(PRODUCT_SOURCES, { cwd: root })
      .filter(
        (file) =>
          file.startsWith("packages/") &&
          file.endsWith(".tsx") &&
          !/\.(test|stories)\.|\/testing\/|\/__fixtures__\//.test(file)
      )
      .filter((file) => {
        const source = readFileSync(join(root, file), "utf8");

        return (
          source.includes('data-shell-bottom-bar=""') &&
          !source.includes("safeAreaBottom")
        );
      })
      .toSorted();

    expect(bare).toEqual(BOTTOM_BARS_WITHOUT_INSET);
  });
});

/** The `#rrggbb` a `rgb(r g b / alpha)` state layer shows over an opaque surface. */
function over(layer: string, surface: string): string {
  const [r = 0, g = 0, b = 0, alpha = 1] = (layer.match(/[\d.]+/g) ?? []).map(
    Number
  );

  const digits = surface.replace("#", "");

  return `#${[r, g, b]
    .map((value, index) => {
      const base = Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16);

      return Math.round(base * (1 - alpha) + value * alpha)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

// Owner, 2026-11-14: a gray-50 hover was invisible on the gray-50 panel and on the dark card.
describe("the hover state layer against DESIGN.md, Hover", () => {
  const surfaces = {
    light: [colorRoles.light.card, colorRoles.light.muted],
    dark: [colorRoles.dark.card, colorRoles.dark.background],
  } as const;

  it("shows on every surface a control sits on and keeps its labels at 4.5:1", () => {
    for (const theme of ["light", "dark"] as const) {
      const roles = colorRoles[theme];

      for (const surface of surfaces[theme]) {
        const hovered = over(roles.hover, surface);

        expect(
          contrastRatio(hovered, surface),
          `${theme} hover on ${surface}`
        ).toBeGreaterThanOrEqual(1.1);

        for (const text of [
          roles.foreground,
          roles["control-foreground"],
          roles["destructive-text"],
        ]) {
          expect(
            contrastRatio(text, hovered),
            `${theme} ${text} on the hover over ${surface}`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("is the only hover fill: no surface color is used as one", () => {
    const root = join(import.meta.dirname, "../../../..");

    const files = globSync(PRODUCT_SOURCES, { cwd: root });

    const offenders = files.filter((file) =>
      /hover\]?:bg-(muted|card|tile|background|border)\b/.test(
        readFileSync(join(root, file), "utf8")
      )
    );

    expect(files.length).toBeGreaterThan(100);

    expect(offenders).toEqual([]);
  });

  it("keeps brand text at 4.5:1 on the hover layer over the surfaces a help trigger sits on", () => {
    // DESIGN.md "Ghost primary" sits on cards and the page. Over the gray-50 panel brand text on the
    // hover layer reads 4.37:1, so a brand-text action there keeps the underline hover of a link.
    for (const [theme, text] of [
      ["light", colorRoles.light.primary],
      ["dark", colorRoles.dark["brand-on-dark"]],
    ] as const) {
      const roles = colorRoles[theme];

      for (const surface of [roles.card, roles.background]) {
        expect(
          contrastRatio(text, over(roles.hover, surface)),
          `${theme} ${text} on the hover over ${surface}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("the event category tones against tokens.md, Category colors", () => {
  // SAFETY: Object.keys answers the keys of the record it is given.
  const names = Object.keys(categoryColors) as (keyof typeof categoryColors)[];

  it("keeps every category chip text at 4.5:1 on its own fill, in both themes", () => {
    for (const name of names) {
      const tones = categoryColors[name];

      for (const theme of ["light", "dark"] as const) {
        const ratio = contrastRatio(tones[theme].text, tones[theme].background);

        expect(
          ratio,
          `${name} in ${theme} measures ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps every category clear of the status colors and the default primary", () => {
    for (const name of names) {
      for (const theme of ["light", "dark"] as const) {
        for (const [role, hex] of [
          ["success", "#047857"],
          ["warning", "#b45309"],
          ["danger", "#b91c1c"],
          ["primary", "#2563eb"],
        ] as const) {
          const apart = distance(categoryColors[name][theme].text, hex);

          expect(
            apart,
            `${name} in ${theme} sits ${apart.toFixed(1)} from ${role}`
          ).toBeGreaterThanOrEqual(10);
        }
      }
    }
  });

  it("names a chip class for every category it colors", () => {
    expect(Object.keys(categoryChipClasses).toSorted()).toEqual(
      Object.keys(categoryColors).toSorted()
    );
  });
});

describe("the chart series colors against tokens.md, Chart series colors", () => {
  it("keeps chart neighbors 15 apart and every slot visible on the card", () => {
    for (const [theme, card, minimum] of [
      ["light", "#ffffff", 2],
      ["dark", "#111827", 3],
    ] as const) {
      const slots = chartColors[theme];

      for (const [index, slot] of slots.entries()) {
        const ratio = contrastRatio(slot, card);

        expect(
          ratio,
          `slot ${index + 1} in ${theme} measures ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(minimum);

        const next = slots[index + 1];

        if (next !== undefined) {
          const apart = distance(slot, next);

          expect(
            apart,
            `slots ${index + 1} and ${index + 2} in ${theme} sit ${apart.toFixed(1)} apart`
          ).toBeGreaterThanOrEqual(15);
        }
      }
    }
  });
});
