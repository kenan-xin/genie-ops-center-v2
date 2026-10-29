"use client";

import {
  Button,
  ConfirmDialog,
  FormActionBar,
  HelpDisclosure,
  StatusPill,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@genie/ui";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { useStore } from "zustand";

import type { BrandingView } from "../../services/branding/index.ts";
import {
  BRANDING_CONTRAST_REFUSAL,
  BRANDING_IMAGE_MAX_BYTES,
  BRANDING_IMAGE_SLOTS,
  BRANDING_IMAGE_TYPES,
  BRANDING_UPLOAD_TOO_LARGE,
  BRANDING_UPLOAD_WRONG_TYPE,
  type BrandingDraft,
  type BrandingImageSlot,
  type BrandingImageView,
  brandingDraftSchema,
  brandingImageType,
} from "../../services/branding/schemas.ts";
import { ColorsTab } from "./colors-tab.tsx";
import {
  type BrandingTab,
  changedByTab,
  changedFields,
  createBrandingDraftStore,
  imageFor,
  SLOT_FIELD,
} from "./draft-store.ts";
import { IdentityTab } from "./identity-tab.tsx";
import type { SlotState } from "./image-slot.tsx";
import { PreviewColors, ShellPreview, SignInPreview } from "./previews.tsx";
import { SignInTab } from "./sign-in-tab.tsx";

export type BrandingScreenProps = {
  readonly branding: BrandingView | undefined;
  readonly loading?: boolean;
  readonly error?: string | undefined;
  readonly timeZone: string;
  /** The sign-in page's heading for a product name, from the host's catalogue (R-54). */
  readonly signInHeading: (productName: string) => string;
  /** The tab help buttons' labels, from the host's catalogue (R-41). */
  readonly helpLabels: {
    readonly darkColor: string;
    readonly squareMark: string;
  };
  /** Receives only the changed fields. A rejection with `{ message, issues }` keeps the draft. */
  readonly onPublish: (changes: Partial<BrandingDraft>) => Promise<void>;
  readonly onUpload: (
    slot: BrandingImageSlot,
    file: File
  ) => Promise<BrandingImageView>;
};

const publishIssue = z.object({
  path: z.string(),
  message: z.string().min(1),
});

// Read the message apart from the issues, so one malformed issue is dropped and the message stays.
const refusedPublish = z
  .object({
    message: z.string().min(1),
    issues: z.array(z.unknown()).optional(),
  })
  .transform((refusal) => ({
    message: refusal.message,
    issues: (refusal.issues ?? []).flatMap((issue) => {
      const parsed = publishIssue.safeParse(issue);

      return parsed.success ? [parsed.data] : [];
    }),
  }))
  .catch({
    message: "That change could not be published. Try again.",
    issues: [],
  });

const uploadMessage = z
  .object({
    message: z.string(),
    issues: z.array(z.object({ message: z.string().min(1) })).min(1),
  })
  .transform((refusal) => refusal.issues[0]?.message ?? refusal.message)
  .or(
    z
      .object({ message: z.string().min(1) })
      .transform((refusal) => refusal.message)
  )
  .catch("The upload failed. Try again.");

const TABS: readonly { value: BrandingTab; label: string }[] = [
  { value: "identity", label: "Identity" },
  { value: "colors", label: "Colors" },
  { value: "sign-in", label: "Sign-in" },
];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The Branding page (R-43 to R-53). Every edit lands in one browser draft and in the preview at
 * once; Publish sends the changed fields in one call, and Discard drops the draft. The host owns
 * the read, the publish and the upload, and refusals keep the draft.
 */
export function BrandingScreen(props: BrandingScreenProps) {
  if (props.branding !== undefined)
    return <BrandingEditor {...props} branding={props.branding} />;

  if (props.error !== undefined)
    return (
      <p
        role="alert"
        className="text-sm text-destructive dark:text-destructive-on-dark"
      >
        {props.error}
      </p>
    );

  return (
    <p role="status" className="text-sm text-muted-foreground">
      Loading branding…
    </p>
  );
}

function BrandingEditor(
  props: BrandingScreenProps & { readonly branding: BrandingView }
) {
  const [store] = useState(() => createBrandingDraftStore(props.branding));
  const draft = useStore(store, (state) => state.draft);
  const published = useStore(store, (state) => state.published);
  const images = useStore(store, (state) => state.images);

  const [slots, setSlots] = useState<
    Partial<Record<BrandingImageSlot, SlotState>>
  >({});

  const [confirm, setConfirm] = useState<"publish" | "discard" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const [serverIssues, setServerIssues] = useState<
    Readonly<Record<string, string>>
  >({});

  const [tab, setTab] = useState<BrandingTab>("identity");
  const scope = useId();

  // The newest read, so a Publish can rebase on a refetch that landed while it was waiting.
  const latest = useRef(props.branding);

  // Counts Discards, so an upload that started before one never lands in the dropped draft.
  const discards = useRef(0);

  // A refused Publish's issues sit under their fields until that field is edited (DR-20 S3-07).
  const clearServerIssue = (field: string) =>
    setServerIssues((current) => {
      if (current[field] === undefined) return current;

      const next = { ...current };

      delete next[field];

      return next;
    });

  const set = <K extends keyof BrandingDraft>(
    field: K,
    value: BrandingDraft[K]
  ) => {
    store.getState().set(field, value);
    clearServerIssue(field);
  };

  const setImage = (
    slot: BrandingImageSlot,
    image: BrandingImageView | null
  ) => {
    store.getState().setImage(slot, image);
    clearServerIssue(SLOT_FIELD[slot]);
  };

  // A fresh read replaces the published values only while nothing is unpublished; with edits in
  // the draft it still brings its fresh preview links.
  useEffect(() => {
    latest.current = props.branding;

    const state = store.getState();

    if (changedFields(state).length === 0) state.rebase(props.branding);
    else state.refreshImages(props.branding);
  }, [props.branding, store]);

  const changed = changedFields({ draft, published });
  const count = changed.length;

  // The browser's own prompt guards a dirty draft; there is no in-app leave dialog (R-44).
  useEffect(() => {
    if (count === 0) return undefined;

    const guard = (event: BeforeUnloadEvent) => event.preventDefault();

    window.addEventListener("beforeunload", guard);

    return () => window.removeEventListener("beforeunload", guard);
  }, [count]);

  const parsed = brandingDraftSchema.safeParse(draft);
  const clientIssues: Record<string, string> = {};

  if (!parsed.success)
    for (const issue of parsed.error.issues)
      clientIssues[issue.path.join(".")] ??= issue.message;

  // Fresh input wins over the last server message for a field that is edited.
  const issues = { ...serverIssues, ...clientIssues };

  // The server's own schema decides, so the browser blocks exactly what a Publish would refuse:
  // a pair below 3:1, never a warning (R-46).
  const blocked =
    count === 0
      ? "No changes to publish."
      : parsed.success
        ? null
        : Object.values(clientIssues).includes(BRANDING_CONTRAST_REFUSAL)
          ? BRANDING_CONTRAST_REFUSAL
          : "Fix the marked fields first.";

  const groups = changedByTab({ draft, published });

  const listed = groups
    .map((group) => `${group.title}: ${group.fields.join(", ")}.`)
    .join(" ");

  const slotImages = Object.fromEntries(
    BRANDING_IMAGE_SLOTS.flatMap((slot) => {
      const image = imageFor({ draft, images }, slot);

      return image === undefined ? [] : [[slot, image]];
    })
  );

  const identity = {
    companyName: draft.companyName,
    productName: draft.productName,
    logoLightUrl: slotImages["logoLight"]?.url ?? null,
    logoDarkUrl: slotImages["logoDark"]?.url ?? null,
    markUrl: slotImages["logoMark"]?.url ?? null,
  };

  async function upload(slot: BrandingImageSlot, file: File) {
    const refuse = (error: string) =>
      setSlots((current) => ({ ...current, [slot]: { error } }));

    if (file.size > BRANDING_IMAGE_MAX_BYTES)
      return refuse(BRANDING_UPLOAD_TOO_LARGE);

    const type = brandingImageType(file);

    if (!BRANDING_IMAGE_TYPES.includes(type))
      return refuse(BRANDING_UPLOAD_WRONG_TYPE);

    // The multipart part carries the file's type, so the type the screen checked is the one sent.
    const typed =
      type === file.type ? file : new File([file], file.name, { type });

    const started = discards.current;

    setSlots((current) => ({ ...current, [slot]: { uploading: file.name } }));

    try {
      const image = await props.onUpload(slot, typed);

      if (discards.current !== started) return;

      setImage(slot, image);
      // A later file's refusal stays: only this upload's own spinner is cleared.
      setSlots((current) =>
        current[slot]?.uploading === file.name
          ? { ...current, [slot]: {} }
          : current
      );
    } catch (cause) {
      if (discards.current === started) refuse(uploadMessage.parse(cause));
    }
  }

  async function publish() {
    if (publishing) return;

    const state = store.getState();

    const changes = Object.fromEntries(
      changedFields(state).map((field) => [field, state.draft[field]])
    );

    const before = latest.current;

    setPublishing(true);
    // Cleared first, so a repeated failure with the same copy takes focus again (FormActionBar).
    setFailure(null);

    try {
      await props.onPublish(changes);

      // A refetch that already landed is the truth; otherwise the sent draft is now published,
      // and the next read replaces it once it arrives.
      const after = latest.current;

      state.rebase(
        after === before ? { ...after, draft: state.draft, images: {} } : after
      );
      setServerIssues({});
    } catch (cause) {
      const refused = refusedPublish.parse(cause);

      setFailure(refused.message);
      setServerIssues(
        Object.fromEntries(
          refused.issues.map((issue) => [issue.path, issue.message])
        )
      );
    } finally {
      setPublishing(false);
      setConfirm(null);
    }
  }

  // One bar: in the status row from 768 px, fixed at the bottom of the screen below it, where a
  // page's primary action lives. A failed Publish shows in it, beside the buttons (DESIGN.md).
  const actions = (
    <section
      aria-label="Publish actions"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background p-3 md:static md:z-auto md:flex-1 md:border-0 md:bg-transparent md:p-0"
    >
      <FormActionBar failure={failure}>
        <Button
          variant="secondary"
          disabled={count === 0}
          onClick={() => setConfirm("discard")}
        >
          Discard
        </Button>
        <Button
          focusableWhenDisabled
          disabled={blocked !== null}
          title={blocked ?? undefined}
          loading={publishing}
          onClick={() => setConfirm("publish")}
        >
          Publish
        </Button>
      </FormActionBar>
    </section>
  );

  const by = props.branding.lastPublished.by;

  const at = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: props.timeZone,
  }).format(new Date(props.branding.lastPublished.at));

  const previewFor = (shown: BrandingTab) =>
    shown === "sign-in" ? (
      <SignInPreview
        identity={identity}
        heading={props.signInHeading(draft.productName)}
        welcomeText={draft.loginWelcomeText ?? ""}
        noticeText={draft.loginNoticeText ?? ""}
        requiresAcknowledgement={draft.loginNoticeRequiresAcknowledgement}
      />
    ) : (
      <ShellPreview identity={identity} />
    );

  return (
    // The fixed phone bar grows by the failure line, so the page keeps room for it.
    <div
      className={`flex flex-col gap-4 md:pb-0 ${failure === null ? "pb-20" : "pb-40"}`}
    >
      <PreviewColors
        scope={scope}
        primaryColor={draft.primaryColor}
        signInBackground={draft.loginBackgroundColor}
      />
      <div className="flex flex-wrap items-center gap-3">
        {count > 0 ? (
          <StatusPill tone="warning">
            {plural(count, "unpublished change", "unpublished changes")}
          </StatusPill>
        ) : (
          <span className="text-sm text-muted-foreground">
            {by === null ? "Set by provisioning" : `Published ${at} by ${by}`}
          </span>
        )}
        <HelpDisclosure label="How publishing works">
          <p>
            Your draft lives in this browser, and nobody else sees it. Publish
            writes every changed field at once and records one audit event.
            Members see the new branding on their next page load. Discard drops
            the draft.
          </p>
        </HelpDisclosure>
        {actions}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            const next = TABS.find((entry) => entry.value === value);

            if (next !== undefined) setTab(next.value);
          }}
          className="min-w-0 lg:col-span-3"
        >
          {/* The wrapper scrolls, not the list: the active underline sits on the list border, so a scrolling list grew a vertical scrollbar. */}
          <div className="max-w-full overflow-x-auto">
            <TabsList>
              {TABS.map((entry) => (
                <TabsTrigger
                  key={entry.value}
                  value={entry.value}
                  onClick={(event) =>
                    event.currentTarget.scrollIntoView({
                      block: "nearest",
                      inline: "nearest",
                    })
                  }
                >
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {TABS.map((entry) => (
            <TabsContent key={entry.value} value={entry.value}>
              <section className="rounded-xl border bg-card p-4 sm:p-5">
                {entry.value === "identity" ? (
                  <IdentityTab
                    draft={draft}
                    issues={issues}
                    images={slotImages}
                    slots={slots}
                    helpLabel={props.helpLabels.squareMark}
                    onChange={set}
                    onFile={(slot, file) => void upload(slot, file)}
                    onRemove={(slot) => {
                      setImage(slot, null);
                      setSlots((current) => ({ ...current, [slot]: {} }));
                    }}
                  />
                ) : entry.value === "colors" ? (
                  <ColorsTab
                    draft={draft}
                    issues={issues}
                    scope={scope}
                    helpLabel={props.helpLabels.darkColor}
                    onColor={(value) => set("primaryColor", value)}
                    onTheme={(value) => set("defaultTheme", value)}
                  />
                ) : (
                  <SignInTab draft={draft} issues={issues} onChange={set} />
                )}
              </section>
            </TabsContent>
          ))}
        </Tabs>
        <PreviewCard
          scope={scope}
          dirty={count > 0}
          caption={
            tab === "sign-in"
              ? "The sign-in page"
              : "The shell with your color and mark"
          }
        >
          {previewFor(tab)}
        </PreviewCard>
      </div>
      <ConfirmDialog
        open={confirm === "publish"}
        title={`Publish ${plural(count, "change", "changes")}?`}
        description={`${listed} Members see the new branding on their next page load.`}
        confirmLabel="Publish"
        danger={false}
        onConfirm={() => void publish()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "discard"}
        title={`Discard ${plural(count, "change", "changes")}?`}
        description={`${listed} The changes are lost.`}
        confirmLabel="Discard"
        danger
        onConfirm={() => {
          discards.current += 1;
          // Reset to the newest read, so a value published elsewhere meanwhile shows (branding L-4).
          store.getState().rebase(latest.current);
          setSlots({});
          setFailure(null);
          setServerIssues({});
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

/** The preview card: Light and Dark, a Draft pill, and on phones a Show preview toggle (R-53). */
function PreviewCard(props: {
  readonly scope: string;
  readonly dirty: boolean;
  readonly caption: string;
  readonly children: ReactNode;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [shown, setShown] = useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-4 lg:col-span-2 lg:self-start">
      <Button
        variant="secondary"
        className="md:hidden"
        aria-expanded={shown}
        onClick={() => setShown(!shown)}
      >
        {shown ? "Hide preview" : "Show preview"}
      </Button>
      <section
        className={`flex-col gap-3 rounded-xl border bg-card p-3 ${shown ? "flex" : "hidden md:flex"}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Preview</h2>
          {props.dirty ? <StatusPill tone="neutral">Draft</StatusPill> : null}
          <span className="text-xs text-muted-foreground">{props.caption}</span>
          <div className="ml-auto flex gap-1">
            {(["light", "dark"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={theme === value ? "secondary" : "ghost"}
                aria-pressed={theme === value}
                onClick={() => setTheme(value)}
              >
                {value === "light" ? "Light" : "Dark"}
              </Button>
            ))}
          </div>
        </div>
        <div
          role="group"
          aria-label="Preview"
          data-branding-preview={props.scope}
          data-theme={theme}
          className="rounded-lg bg-background text-foreground"
        >
          {props.children}
        </div>
      </section>
    </div>
  );
}
