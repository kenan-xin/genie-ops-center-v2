"use client";

import type {
  BrandingDraft,
  BrandingImageSlot,
  BrandingImageView,
} from "../../services/branding/schemas.ts";
import { SLOT_FIELD } from "./draft-store.ts";
import { ImageSlot, type SlotState } from "./image-slot.tsx";
import { TextField } from "./text-field.tsx";

const SLOTS: readonly {
  slot: BrandingImageSlot;
  label: string;
  recommended: string;
}[] = [
  {
    slot: "logoLight",
    label: "Logo for light backgrounds",
    recommended: "SVG or PNG, at least 480 by 96 px, transparent background",
  },
  {
    slot: "logoDark",
    label: "Logo for dark backgrounds",
    recommended:
      "SVG or PNG, at least 480 by 96 px, light artwork for dark surfaces",
  },
  {
    slot: "logoMark",
    label: "Square mark",
    recommended: "Square, at least 512 by 512 px",
  },
  {
    slot: "favicon",
    label: "Favicon",
    recommended: "Square, 48 by 48 px, ICO, PNG, or SVG",
  },
];

export function IdentityTab(props: {
  readonly draft: BrandingDraft;
  readonly issues: Readonly<Record<string, string>>;
  readonly images: Partial<Record<BrandingImageSlot, BrandingImageView>>;
  readonly slots: Partial<Record<BrandingImageSlot, SlotState>>;
  readonly onChange: (
    field: "companyName" | "productName",
    value: string
  ) => void;
  readonly onFile: (slot: BrandingImageSlot, file: File) => void;
  readonly onRemove: (slot: BrandingImageSlot) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="branding-company-name"
          label="Company name"
          value={props.draft.companyName}
          error={props.issues["companyName"]}
          onChange={(value) => props.onChange("companyName", value)}
        />
        <TextField
          id="branding-product-name"
          label="Product name"
          value={props.draft.productName}
          error={props.issues["productName"]}
          description="Shown under the company name in the sidebar and on sign-in."
          onChange={(value) => props.onChange("productName", value)}
        />
      </div>
      {SLOTS.map((entry) => (
        <ImageSlot
          key={entry.slot}
          label={entry.label}
          recommended={entry.recommended}
          image={props.images[entry.slot]}
          state={props.slots[entry.slot] ?? {}}
          issue={props.issues[SLOT_FIELD[entry.slot]]}
          onFile={(file) => props.onFile(entry.slot, file)}
          onRemove={() => props.onRemove(entry.slot)}
        />
      ))}
      <p className="text-sm text-muted-foreground">
        Without a square mark, the shell shows the first letter of the company
        name.
      </p>
    </div>
  );
}
