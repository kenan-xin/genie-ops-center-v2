"use client";

import { focusRing, RadioGroup, RadioGroupItem } from "@genie/ui";

import { brandingContrastPairs } from "../../lib/branding/contrast-pairs.ts";
import { foregroundFor } from "../../lib/branding/foreground.ts";
import {
  type BrandingDraft,
  HEX_COLOR,
} from "../../services/branding/schemas.ts";
import { ContrastPills } from "./contrast-pills.tsx";
import { TextField } from "./text-field.tsx";

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

function isTheme(value: unknown): value is BrandingDraft["defaultTheme"] {
  return THEMES.some((theme) => theme.value === value);
}

/** One tenant color with its computed foreground, the four checks, and the default theme (R-46, R-47). */
export function ColorsTab(props: {
  readonly draft: BrandingDraft;
  readonly issues: Readonly<Record<string, string>>;
  readonly scope: string;
  readonly onColor: (value: string) => void;
  readonly onTheme: (value: BrandingDraft["defaultTheme"]) => void;
}) {
  const color = props.draft.primaryColor;
  const valid = HEX_COLOR.test(color);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <input
          type="color"
          aria-label="Pick the primary color"
          value={valid ? color.toLowerCase() : "#000000"}
          className={`h-10 w-12 cursor-pointer rounded-lg border bg-background p-1 ${focusRing}`}
          onChange={(event) => props.onColor(event.target.value)}
        />
        <div className="w-48">
          <TextField
            id="branding-primary-color"
            label="Primary color"
            value={color}
            error={props.issues["primaryColor"]}
            onChange={props.onColor}
          />
        </div>
        {valid ? (
          <span
            data-branding-preview={props.scope}
            className="flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            Aa <span className="font-mono text-xs">{foregroundFor(color)}</span>
          </span>
        ) : null}
      </div>
      {valid ? <ContrastPills pairs={brandingContrastPairs(color)} /> : null}
      <p className="text-sm text-pretty text-muted-foreground">
        In the dark theme, brand text and the focus ring use one fixed light
        color, #60a5fa. Buttons keep this color in both themes.
      </p>
      <div className="flex flex-col gap-2">
        <span id="branding-theme-label" className="text-sm font-medium">
          Default theme
        </span>
        <RadioGroup
          value={props.draft.defaultTheme}
          onValueChange={(value) => {
            if (isTheme(value)) props.onTheme(value);
          }}
          aria-labelledby="branding-theme-label"
        >
          {THEMES.map((theme) => (
            <label
              key={theme.value}
              className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
            >
              <RadioGroupItem value={theme.value} />
              {theme.label}
            </label>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
