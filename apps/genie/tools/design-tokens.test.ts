/**
 * The application stylesheet against the typed fixed layer in `packages/ui` (D3-3).
 *
 * It compiles the real `globals.css` in place with the `@tailwindcss/postcss`
 * plugin of the Next build. One appended `@source inline(...)` line decides which
 * utilities exist, so no staged root is needed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  colorRoles,
  defaultFont,
  defaultFontSizePreset,
  fontSizePresetsPx,
  monoFont,
  motion,
  radiusPx,
  spacingPx,
  type ColorRole,
} from "@genie/ui/tokens";
import tailwindcss from "@tailwindcss/postcss";
import postcss, { type Root, type Rule } from "postcss";
import { beforeAll, describe, expect, it } from "vitest";

const STYLESHEET = resolve(import.meta.dirname, "../src/styles/globals.css");

// The utilities whose rules and theme variables the cases below read.
const PROBES = [
  "bg-primary",
  "text-muted-foreground",
  "border-input",
  "ring-ring",
  "text-brand-on-dark",
  "dark:bg-card",
  "h-10",
  "rounded-md",
  "rounded-lg",
  "rounded-xl",
  "transition-colors",
  "font-sans",
  "font-mono",
];

async function compiledStylesheet(): Promise<Root> {
  const source = `${readFileSync(STYLESHEET, "utf8")}\n@source inline("${PROBES.join(" ")}");\n`;

  const { css } = await postcss([tailwindcss()]).process(source, {
    from: STYLESHEET,
  });

  return postcss.parse(css);
}

function rulesFor(root: Root, selector: string): Rule[] {
  const rules: Rule[] = [];

  root.walkRules((rule) => {
    if (rule.selectors.includes(selector)) rules.push(rule);
  });

  return rules;
}

/** The declarations of every rule whose selector list holds `selector`, later rules winning. */
function declarations(
  root: Root,
  selector: string
): ReadonlyMap<string, string> {
  const found = new Map<string, string>();

  for (const rule of rulesFor(root, selector)) {
    rule.walkDecls((decl) => {
      found.set(decl.prop, decl.value);
    });
  }

  return found;
}

// SAFETY: colorRoles.light is typed Record<ColorRole, string>, so its keys are exactly the roles.
const ROLES = Object.keys(colorRoles.light) as ColorRole[];

let root: Root;

beforeAll(async () => {
  root = await compiledStylesheet();
});

describe("the application stylesheet's fixed token layer", () => {
  it("defines every color role in both themes with the value packages/ui holds (D3-3)", () => {
    const light = declarations(root, ":root");

    const dark = new Map([
      ...light,
      ...declarations(root, '[data-theme="dark"]'),
    ]);

    for (const role of ROLES) {
      expect(light.get(`--${role}`), `light --${role}`).toBe(
        colorRoles.light[role]
      );
      expect(dark.get(`--${role}`), `dark --${role}`).toBe(
        colorRoles.dark[role]
      );
    }
  });

  it("maps each role to a same-named Tailwind color that reads the runtime variable (R-1)", () => {
    expect(declarations(root, ".bg-primary").get("background-color")).toBe(
      "var(--primary)"
    );
    expect(declarations(root, ".text-muted-foreground").get("color")).toBe(
      "var(--muted-foreground)"
    );
    expect(declarations(root, ".border-input").get("border-color")).toBe(
      "var(--input)"
    );
    expect(declarations(root, ".ring-ring").get("--tw-ring-color")).toBe(
      "var(--ring)"
    );
    expect(declarations(root, ".text-brand-on-dark").get("color")).toBe(
      "var(--brand-on-dark)"
    );
  });

  it("makes dark: follow data-theme on the document, never the operating system (R-17)", () => {
    const css = root.toString();

    expect(css).toContain(":where([data-theme=dark], [data-theme=dark] *)");
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("fixes spacing, radius and motion to the packages/ui values, on a 15 px root (R-3, R-5 to R-7)", () => {
    const rootDeclarations = declarations(root, ":root");

    expect(rootDeclarations.get("--spacing")).toBe(`${spacingPx}px`);
    expect(rootDeclarations.get("--radius-md")).toBe(`${radiusPx.menu}px`);
    expect(rootDeclarations.get("--radius-lg")).toBe(`${radiusPx.control}px`);
    expect(rootDeclarations.get("--radius-xl")).toBe(`${radiusPx.card}px`);
    expect(rootDeclarations.get("--default-transition-duration")).toBe(
      `${motion.durationMs}ms`
    );
    expect(rootDeclarations.get("--default-transition-timing-function")).toBe(
      motion.easing
    );
    expect(rootDeclarations.get("font-size")).toBe(
      `${fontSizePresetsPx[defaultFontSizePreset]}px`
    );
  });

  it("keeps --font-sans a runtime seam that defaults to the default face (R-10)", () => {
    const rootDeclarations = declarations(root, ":root");

    expect(rootDeclarations.get("--font-sans")).toBe(
      `var(--font-face-${defaultFont})`
    );
    expect(rootDeclarations.get("--font-mono")).toBe(
      `var(--font-face-${monoFont})`
    );
    expect(declarations(root, ".font-sans").get("font-family")).toBe(
      "var(--font-sans)"
    );
    expect(rootDeclarations.has("--font-face-plus-jakarta-sans")).toBe(true);
  });

  it("puts the fixed colors in a cascade layer, so the unlayered branding style always wins (R-12, R-13)", () => {
    const owners = rulesFor(root, ":root").filter((rule) =>
      rule.nodes.some(
        (node) => node.type === "decl" && node.prop === "--primary"
      )
    );

    expect(owners).not.toHaveLength(0);

    for (const rule of owners) {
      expect(rule.parent?.type).toBe("atrule");
      expect(rule.parent).toMatchObject({ name: "layer", params: "base" });
    }
  });
});
