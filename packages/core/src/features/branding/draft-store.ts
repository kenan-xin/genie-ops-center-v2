import { isEqual } from "es-toolkit";
import { devtools } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

import type { BrandingView } from "../../services/branding/index.ts";
import {
  BRANDING_FIELDS,
  type BrandingDraft,
  type BrandingImageSlot,
  type BrandingImageView,
} from "../../services/branding/schemas.ts";

export type BrandingTab = "identity" | "colors" | "sign-in";

type Field = keyof BrandingDraft;

export const SLOT_FIELD = {
  logoLight: "logoLightFileId",
  logoDark: "logoDarkFileId",
  logoMark: "logoMarkFileId",
  favicon: "faviconFileId",
} as const satisfies Record<BrandingImageSlot, Field>;

export const TAB_TITLES: Record<BrandingTab, string> = {
  "identity": "Identity",
  "colors": "Colors and theme",
  "sign-in": "Sign-in page",
};

const TAB_ORDER: readonly BrandingTab[] = ["identity", "colors", "sign-in"];

/** Each field's tab and the label the publish and discard lists show. */
const FIELD_LABELS: Record<
  Field,
  { readonly tab: BrandingTab; readonly label: string }
> = {
  companyName: { tab: "identity", label: "Company name" },
  productName: { tab: "identity", label: "Product name" },
  logoLightFileId: { tab: "identity", label: "Logo for light backgrounds" },
  logoDarkFileId: { tab: "identity", label: "Logo for dark backgrounds" },
  logoMarkFileId: { tab: "identity", label: "Square mark" },
  faviconFileId: { tab: "identity", label: "Favicon" },
  primaryColor: { tab: "colors", label: "Primary color" },
  defaultTheme: { tab: "colors", label: "Default theme" },
  loginBackgroundColor: { tab: "sign-in", label: "Background color" },
  loginWelcomeText: { tab: "sign-in", label: "Welcome text" },
  loginNoticeText: { tab: "sign-in", label: "System-use notice" },
  loginNoticeRequiresAcknowledgement: {
    tab: "sign-in",
    label: "Notice acknowledgement",
  },
};

export type BrandingDraftState = {
  readonly published: BrandingDraft;
  readonly draft: BrandingDraft;
  /** Every image view this page has seen, by file id, so a slot set back finds its image. */
  readonly images: Readonly<Record<string, BrandingImageView>>;
  readonly set: <K extends Field>(field: K, value: BrandingDraft[K]) => void;
  readonly setImage: (
    slot: BrandingImageSlot,
    image: BrandingImageView | null
  ) => void;
  readonly discard: () => void;
  readonly rebase: (published: BrandingView) => void;
  /** Takes a refetch's preview links (they expire) and leaves the draft alone (D3-7). */
  readonly refreshImages: (view: BrandingView) => void;
};

function imagesOf(view: BrandingView): Record<string, BrandingImageView> {
  return Object.fromEntries(
    Object.values(view.images).map((image) => [image.fileId, image])
  );
}

/**
 * The one browser draft of the Branding page (R-43, R-94). It lives only in this tab: nothing is
 * written until Publish, and Discard drops it. One store per mount, so stories and tests never
 * share a draft. It carries the devtools middleware (tech-stack, Client state).
 */
export function createBrandingDraftStore(view: BrandingView) {
  return createStore<BrandingDraftState>()(
    devtools(
      (set) => ({
        published: view.draft,
        draft: view.draft,
        images: imagesOf(view),
        set: (field, value) =>
          set((state) => ({ draft: { ...state.draft, [field]: value } })),
        setImage: (slot, image) =>
          set((state) => ({
            draft: {
              ...state.draft,
              [SLOT_FIELD[slot]]: image?.fileId ?? null,
            },
            images:
              image === null
                ? state.images
                : { ...state.images, [image.fileId]: image },
          })),
        discard: () => set((state) => ({ draft: state.published })),
        rebase: (next) =>
          set((state) => ({
            published: next.draft,
            draft: next.draft,
            images: { ...state.images, ...imagesOf(next) },
          })),
        refreshImages: (fresh) =>
          set((state) => ({ images: { ...state.images, ...imagesOf(fresh) } })),
      }),
      // The middleware switches itself off in a production build and without the extension.
      { name: "Branding draft" }
    )
  );
}

export type BrandingDraftStore = ReturnType<typeof createBrandingDraftStore>;

/** The fields the draft changes, in schema order. Compute it in render, not in a selector. */
export function changedFields(
  state: Pick<BrandingDraftState, "draft" | "published">
): Field[] {
  return BRANDING_FIELDS.filter(
    (field) => !isEqual(state.draft[field], state.published[field])
  );
}

/** The changed fields as the publish and discard dialogs list them, by tab in tab order. */
export function changedByTab(
  state: Pick<BrandingDraftState, "draft" | "published">
) {
  const changed = changedFields(state);

  return TAB_ORDER.flatMap((tab) => {
    const fields = changed
      .filter((field) => FIELD_LABELS[field].tab === tab)
      .map((field) => FIELD_LABELS[field].label);

    return fields.length === 0 ? [] : [{ tab, title: TAB_TITLES[tab], fields }];
  });
}

/** The image a slot of the draft names, when this page has its view. */
export function imageFor(
  state: Pick<BrandingDraftState, "draft" | "images">,
  slot: BrandingImageSlot
): BrandingImageView | undefined {
  const fileId = state.draft[SLOT_FIELD[slot]];

  return fileId === null || fileId === undefined
    ? undefined
    : state.images[fileId];
}
