"use client";

import {
  Button,
  ConfirmDialog,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  SheetFooter,
  focusRing,
  iconLeadPx,
  Textarea,
} from "@genie/ui";
import { useForm } from "@tanstack/react-form";
import { isEqual } from "es-toolkit";
import {
  ChartColumnIcon,
  ChartLineIcon,
  ImageIcon,
  ImagePlusIcon,
  InfoIcon,
  ListIcon,
  PlusIcon,
  SparklesIcon,
  TableIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";

import {
  type ElementInput,
  slideInput,
  type SlideInput,
  TEXT_CHARACTERS,
  TITLE_CHARACTERS,
} from "../contract.ts";
import type { ImageLinks } from "./image-links.ts";
import { SlideCanvas, type SlideCanvasProps } from "./slide-canvas.tsx";
import { addRefusal } from "./slide-rules.ts";
import type { ShownElement, ShownSlide } from "./views.ts";

/** The schema's bullet limit, so the person meets it before the server does. */
const BULLET_LIMIT = 5;

const IMAGE_COPY = "Upload a PNG or JPEG image.";

const ALT_COPY = "Add alt text for this image.";

/** The schema's alt text limit (contract.ts `imageElement`). */
const ALT_CHARACTERS = 200;

const VISUAL_KINDS = { figure: "Figure", chart: "Chart", table: "Table" };

export type SlideEditorProps = {
  readonly slide: ShownSlide;
  /** What the live preview draws with: the deck's figures date, zone, theme, logo and image links. */
  readonly canvas: Omit<SlideCanvasProps, "slide">;
  readonly saving?: boolean;
  /** Opens Ask; undefined for a person without Ask, so the charts note has no link. */
  readonly onAsk?: (() => void) | undefined;
  readonly onSave: (slide: SlideInput) => void;
  readonly onClose: () => void;
  readonly onUpload: (file: File) => Promise<string>;
};

function isVisual(element: ElementInput): boolean {
  return (
    element.kind === "figure" ||
    element.kind === "chart" ||
    element.kind === "table" ||
    element.kind === "image"
  );
}

function isData(
  element: ElementInput
): element is Extract<ElementInput, { kind: keyof typeof VISUAL_KINDS }> {
  return (
    element.kind === "figure" ||
    element.kind === "chart" ||
    element.kind === "table"
  );
}

/** A row's name: the chart title, or "Image", numbered on a slide with two. */
function visualName(elements: readonly ElementInput[], index: number): string {
  const element = elements[index];

  if (element?.kind === "image") {
    const images = elements.filter(({ kind }) => kind === "image");

    return images.length > 1 ? `Image ${images.indexOf(element) + 1}` : "Image";
  }

  if (
    element?.kind !== "figure" &&
    element?.kind !== "chart" &&
    element?.kind !== "table"
  ) {
    return "Element";
  }

  // SAFETY: every data element comes from the stored slide, so its chart is the server's
  // PanelConfig, whose title the panel schema guarantees.
  const chart = element.chart as { readonly title: string };

  return chart.title;
}

/** A row's kind, with the sources of its frozen data where it has them. */
function visualMeta(slide: ShownSlide, element: ElementInput): string {
  if (element.kind === "image") return "Image · PNG or JPEG";

  if (!isData(element)) return "";

  const kind = VISUAL_KINDS[element.kind];
  const stored = storedVisual(slide, element);

  const sources =
    stored !== undefined && "data" in stored ? stored.data.sources : undefined;

  return sources === undefined || sources.length === 0
    ? kind
    : `${kind} · from ${sources.join(", ")}`;
}

function VisualThumb(props: {
  readonly element: ElementInput;
  readonly images: ImageLinks;
}): ReactNode {
  const { element } = props;

  switch (element.kind) {
    case "figure":
      return <ChartColumnIcon aria-hidden="true" className="size-5" />;
    case "chart":
      return <ChartLineIcon aria-hidden="true" className="size-5" />;
    case "table":
      return <TableIcon aria-hidden="true" className="size-5" />;
    case "image": {
      const url = props.images[element.fileId]?.url;

      return url === undefined ? (
        <ImageIcon aria-hidden="true" className="size-5" />
      ) : (
        <img src={url} alt="" className="size-full object-cover" />
      );
    }

    default:
      return null;
  }
}

/** Why a control is off: the rule, beside an info glyph. */
function Reason(props: { readonly id: string; readonly children: string }) {
  return (
    <p id={props.id} className="flex gap-2 text-sm text-muted-foreground">
      <InfoIcon aria-hidden="true" className="size-4 shrink-0" />
      {props.children}
    </p>
  );
}

/**
 * A text as bullets: one trimmed item per line, empty lines dropped. Lines past the fifth join the
 * fifth, so no words are lost.
 */
export function bulletsOf(text: string): string[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  if (lines.length === 0) return [text.trim()];

  return [
    ...lines.slice(0, BULLET_LIMIT - 1),
    ...(lines.length < BULLET_LIMIT
      ? []
      : [lines.slice(BULLET_LIMIT - 1).join(" ")]),
  ];
}

/** Bullets as one text: the trimmed items, joined by one space. */
export function textOf(items: readonly string[]): string {
  return items
    .flatMap((item) => (item.trim() === "" ? [] : [item.trim()]))
    .join(" ");
}

/**
 * One element as the change sends it. A figure, chart or table keeps the stored chart, so the
 * deck's frozen data stays as it is (R-54); a hidden element carries its chart too, so an edit
 * never drops it.
 */
export function inputOfElement(element: ShownElement): ElementInput {
  // The box and style ride along, so a text edit keeps them (R-52a).
  const placement = { box: element.box, style: element.style };

  switch (element.kind) {
    case "title":
    case "text":
      return { kind: element.kind, text: element.text, ...placement };
    case "bullets":
      return { kind: "bullets", items: [...element.items], ...placement };
    case "image":
      return {
        kind: "image",
        fileId: element.fileId,
        alt: element.alt,
        ...placement,
      };
    case "figure":
    case "chart":
    case "table":
      return { kind: element.kind, chart: element.chart, ...placement };
  }
}

/**
 * One slide as its stored input, to tell a save that changes nothing (no Undo entry spent). It
 * never sends the notes: the page's notes field saves them per pause, and a Save slide must not
 * overwrite the text a pause already saved.
 */
export function slideInputOf(slide: ShownSlide): SlideInput {
  return {
    elements: slide.elements.map(inputOfElement),
    background: slide.background,
  };
}

/** The stored element that a figure, chart, table or image of the form stands for. */
export function storedVisual(
  slide: ShownSlide,
  element: ElementInput
): ShownElement | undefined {
  if (element.kind === "image") {
    return slide.elements.find(
      (stored) => stored.kind === "image" && stored.fileId === element.fileId
    );
  }

  if (
    element.kind !== "figure" &&
    element.kind !== "chart" &&
    element.kind !== "table"
  ) {
    return undefined;
  }

  const same = slide.elements.flatMap((stored) =>
    stored.kind === element.kind && "chart" in stored ? [stored] : []
  );

  return (
    same.find((stored) => stored.chart === element.chart) ??
    same.find((stored) => isEqual(stored.chart, element.chart))
  );
}

/** The slide as the form holds it, for the live preview; a figure, chart or table keeps its frozen data (R-54). */
export function previewSlide(slide: ShownSlide, input: SlideInput): ShownSlide {
  const elements = input.elements.flatMap((element): ShownElement[] => {
    if (
      element.kind !== "figure" &&
      element.kind !== "chart" &&
      element.kind !== "table"
    ) {
      return [element];
    }

    const stored = storedVisual(slide, element);

    return stored === undefined ? [] : [stored];
  });

  return { id: slide.id, background: input.background, elements };
}

/** The ids of a control's helper and error text, so a screen reader hears both (DESIGN.md). */
export function describedBy(
  ...ids: readonly (string | undefined)[]
): string | undefined {
  const value = ids.filter((id) => id !== undefined).join(" ");

  return value === "" ? undefined : value;
}

export function issueOf(errors: readonly unknown[]): string | undefined {
  const first = errors[0];

  // SAFETY: TanStack Form stores a Standard Schema issue object here, and its message is a string.
  return first === undefined
    ? undefined
    : String((first as { readonly message?: string }).message ?? first);
}

/** The hand edit of one slide: its claim, its text and its visuals (R-52, R-54). */
export function SlideEditor(props: SlideEditorProps) {
  const { slide, canvas, onAsk, onSave, onClose, onUpload } = props;
  const titleId = useId();
  const titleHelpId = useId();
  const titleCountId = useId();
  const titleErrorId = useId();
  const textId = useId();
  const textCountId = useId();
  const textErrorId = useId();
  const bulletId = useId();
  const bulletsHeadingId = useId();
  const bulletLimitId = useId();
  const noBodyHeadingId = useId();
  const bodyReasonId = useId();
  const visualsId = useId();
  const imageHintId = useId();
  const imageReasonId = useId();
  const [asking, setAsking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadErrorId = useId();
  const [uploading, setUploading] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const form = useForm({
    defaultValues: slideInputOf(slide),
    validators: {
      onMount: slideInput,
      onChange: slideInput,
      onSubmit: slideInput,
    },
    // An invalid form would skip the submit validation, so a field mounted after the last change,
    // such as an uploaded image's Alt text, would show its error only on a second Save.
    canSubmitWhenInvalid: true,
    onSubmitInvalid: () => setAttempted(true),
    onSubmit: ({ value }) => {
      const parsed = slideInput.safeParse(value);

      if (!parsed.success) {
        setAttempted(true);

        return;
      }

      onSave(parsed.data);
    },
  });

  async function addImage(file: File | undefined): Promise<void> {
    if (file === undefined) return;

    setUploadError(null);

    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setUploadError(IMAGE_COPY);

      return;
    }

    setUploading(true);

    try {
      const fileId = await onUpload(file);

      form.pushFieldValue("elements", { kind: "image", fileId, alt: "" });
    } catch (error) {
      setUploadError(
        error instanceof Error && error.message !== ""
          ? error.message
          : IMAGE_COPY
      );
    } finally {
      setUploading(false);
    }
  }

  /** Changes a bullets element's items; removes the whole body when none remain. */
  function changeBullets(
    bodyIndex: number,
    next: (items: readonly string[]) => readonly string[]
  ): void {
    const body = form.state.values.elements[bodyIndex];

    if (body?.kind !== "bullets") return;

    const items = next(body.items);

    form.setFieldValue("elements", (current) =>
      items.length === 0
        ? current.filter((_, index) => index !== bodyIndex)
        : current.map((element, index) =>
            index === bodyIndex && element.kind === "bullets"
              ? { ...element, items: [...items] }
              : element
          )
    );
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-5 pt-4 pb-6">
        <form.Subscribe selector={(state) => state.values}>
          {(values) => (
            <div className="flex flex-col gap-1.5 max-md:flex-row max-md:items-end max-md:gap-3">
              {/* The preview repeats the fields, so it stays out of the tab order and the tree. */}
              <div
                aria-hidden="true"
                inert
                className="w-full overflow-hidden rounded-lg border border-border max-md:max-w-60"
              >
                <SlideCanvas slide={previewSlide(slide, values)} {...canvas} />
              </div>
              <p className="text-xs text-muted-foreground">
                Preview. Changes show here before you save.
              </p>
            </div>
          )}
        </form.Subscribe>

        <form.Field name="elements[0].text">
          {(field) => {
            const issue = issueOf(field.state.meta.errors);

            const show =
              issue !== undefined && (attempted || field.state.meta.isTouched);

            const value = field.state.value ?? "";

            return (
              <Field>
                <div className="flex items-baseline justify-between gap-3">
                  <FieldLabel htmlFor={titleId}>Title</FieldLabel>
                  <span
                    id={titleCountId}
                    className="text-xs text-muted-foreground tabular-nums"
                  >
                    {value.length} / {TITLE_CHARACTERS}
                  </span>
                </div>
                <Textarea
                  id={titleId}
                  rows={2}
                  maxLength={TITLE_CHARACTERS}
                  className="resize-none"
                  value={value}
                  onChange={(event) =>
                    // A title is one sentence: a line break, typed or pasted, becomes a space.
                    field.handleChange(
                      event.target.value.replace(/\s*\n\s*/g, " ")
                    )
                  }
                  onBlur={field.handleBlur}
                  aria-invalid={show ? true : undefined}
                  aria-describedby={describedBy(
                    titleHelpId,
                    titleCountId,
                    show ? titleErrorId : undefined
                  )}
                />
                <FieldDescription id={titleHelpId}>
                  The finding of this slide, in one sentence.
                </FieldDescription>
                {show ? (
                  <FieldError id={titleErrorId}>{issue}</FieldError>
                ) : null}
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="elements" mode="array">
          {(elements) => {
            const value = elements.state.value;
            const kinds = value.map(({ kind }) => kind);

            const bodyIndex = value.findIndex(
              (element) => element.kind === "text" || element.kind === "bullets"
            );

            const body = bodyIndex === -1 ? undefined : value[bodyIndex];
            const visuals = value.filter(isVisual).length;
            // Text and bullets share the one-body rule, so one reason serves both buttons.
            const bodyRefusal = addRefusal(kinds, "text");
            const imageRefusal = addRefusal(kinds, "image");

            return (
              <>
                {body?.kind === "text" ? (
                  <form.Field name={`elements[${bodyIndex}].text`}>
                    {(field) => {
                      const issue = issueOf(field.state.meta.errors);

                      const show =
                        issue !== undefined &&
                        (attempted || field.state.meta.isTouched);

                      const text = field.state.value ?? "";

                      return (
                        <Field>
                          <div className="flex items-baseline justify-between gap-3">
                            <FieldLabel htmlFor={textId}>Text</FieldLabel>
                            <span
                              id={textCountId}
                              className="text-xs text-muted-foreground tabular-nums"
                            >
                              {text.length} / {TEXT_CHARACTERS}
                            </span>
                          </div>
                          <Textarea
                            id={textId}
                            rows={3}
                            maxLength={TEXT_CHARACTERS}
                            value={text}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            onBlur={field.handleBlur}
                            aria-invalid={show ? true : undefined}
                            aria-describedby={describedBy(
                              textCountId,
                              show ? textErrorId : undefined
                            )}
                          />
                          {show ? (
                            <FieldError id={textErrorId}>{issue}</FieldError>
                          ) : null}
                          <div className="flex items-center justify-between gap-3">
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="-ms-3"
                              disabled={props.saving}
                              onClick={() =>
                                elements.replaceValue(bodyIndex, {
                                  kind: "bullets",
                                  items: bulletsOf(text),
                                  box: body.box,
                                  style: body.style,
                                })
                              }
                            >
                              <ListIcon
                                aria-hidden="true"
                                data-icon="inline-start"
                                className={iconLeadPx[2]}
                              />
                              Use bullets
                            </Button>
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              // oxlint-disable-next-line shadcn/no-restyle -- edit-slide.prototype.html: Remove text is the danger link
                              className="px-0 text-destructive-text"
                              disabled={props.saving}
                              onClick={() => elements.removeValue(bodyIndex)}
                            >
                              Remove text
                            </Button>
                          </div>
                        </Field>
                      );
                    }}
                  </form.Field>
                ) : null}

                {body?.kind === "bullets" ? (
                  <div className="grid gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        id={bulletsHeadingId}
                        className="text-sm font-semibold"
                      >
                        Bullets
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {body.items.length} of {BULLET_LIMIT}
                      </span>
                    </div>
                    <div
                      role="group"
                      aria-labelledby={bulletsHeadingId}
                      className="grid gap-2"
                    >
                      {body.items.map((item, bulletIndex) => (
                        <form.Field
                          key={`bullet-${bulletIndex}`}
                          name={`elements[${bodyIndex}].items[${bulletIndex}]`}
                        >
                          {(field) => {
                            const issue = issueOf(field.state.meta.errors);
                            const errorId = `${bulletId}-${bulletIndex}-error`;

                            const show =
                              issue !== undefined &&
                              (attempted || field.state.meta.isTouched);

                            return (
                              <Field>
                                <div className="flex items-center gap-2">
                                  <Input
                                    aria-label={`Bullet ${bulletIndex + 1}`}
                                    value={field.state.value ?? ""}
                                    onValueChange={field.handleChange}
                                    onBlur={field.handleBlur}
                                    aria-invalid={show ? true : undefined}
                                    aria-describedby={describedBy(
                                      show ? errorId : undefined
                                    )}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Remove bullet ${bulletIndex + 1}`}
                                    disabled={props.saving}
                                    onClick={() =>
                                      changeBullets(bodyIndex, (items) =>
                                        items.filter(
                                          (_, at) => at !== bulletIndex
                                        )
                                      )
                                    }
                                  >
                                    <Trash2Icon aria-hidden="true" />
                                  </Button>
                                </div>
                                {show ? (
                                  <FieldError id={errorId}>{issue}</FieldError>
                                ) : null}
                              </Field>
                            );
                          }}
                        </form.Field>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="-ms-3"
                        disabled={
                          body.items.length >= BULLET_LIMIT || props.saving
                        }
                        focusableWhenDisabled
                        aria-describedby={
                          body.items.length >= BULLET_LIMIT
                            ? bulletLimitId
                            : undefined
                        }
                        onClick={() =>
                          changeBullets(bodyIndex, (items) => [...items, ""])
                        }
                      >
                        <PlusIcon
                          aria-hidden="true"
                          data-icon="inline-start"
                          className={iconLeadPx[4]}
                        />
                        Add a bullet
                      </Button>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="-me-3"
                        disabled={props.saving}
                        onClick={() =>
                          elements.replaceValue(bodyIndex, {
                            kind: "text",
                            text: textOf(body.items),
                            box: body.box,
                            style: body.style,
                          })
                        }
                      >
                        Use text
                      </Button>
                    </div>
                    {body.items.length >= BULLET_LIMIT ? (
                      <FieldDescription id={bulletLimitId}>
                        A bullet list holds at most 5 bullets.
                      </FieldDescription>
                    ) : null}
                  </div>
                ) : null}

                {body === undefined ? (
                  <div
                    role="group"
                    aria-labelledby={noBodyHeadingId}
                    className="grid gap-2"
                  >
                    <span
                      id={noBodyHeadingId}
                      className="text-sm font-semibold"
                    >
                      Text
                    </span>
                    <p className="text-sm text-muted-foreground">
                      This slide has no text yet. A slide holds one text or one
                      bullet list.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={props.saving || bodyRefusal !== undefined}
                        focusableWhenDisabled
                        aria-describedby={
                          bodyRefusal === undefined ? undefined : bodyReasonId
                        }
                        onClick={() =>
                          elements.insertValue(1, { kind: "text", text: "" })
                        }
                      >
                        <PlusIcon aria-hidden="true" data-icon="inline-start" />
                        Add text
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={props.saving || bodyRefusal !== undefined}
                        focusableWhenDisabled
                        aria-describedby={
                          bodyRefusal === undefined ? undefined : bodyReasonId
                        }
                        onClick={() =>
                          elements.insertValue(1, {
                            kind: "bullets",
                            items: [""],
                          })
                        }
                      >
                        <ListIcon aria-hidden="true" data-icon="inline-start" />
                        Add bullets
                      </Button>
                    </div>
                    {bodyRefusal === undefined ? null : (
                      <Reason id={bodyReasonId}>{bodyRefusal}</Reason>
                    )}
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span id={visualsId} className="text-sm font-semibold">
                      Charts and images
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {visuals} of 2
                    </span>
                  </div>
                  {visuals === 0 ? null : (
                    <ul
                      aria-labelledby={visualsId}
                      className="rounded-xl border border-border"
                    >
                      {value.map((element, index) => {
                        if (!isVisual(element)) return null;

                        const name = visualName(value, index);

                        return (
                          <li
                            key={`visual-${index}-${element.kind}`}
                            className="flex flex-wrap items-center gap-3 border-b border-border py-2.5 ps-3 pe-1.5 last:border-b-0"
                          >
                            <div
                              data-visual-thumb=""
                              className="grid h-9 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-tile"
                            >
                              <VisualThumb
                                element={element}
                                images={canvas.images}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold wrap-anywhere">
                                {name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {visualMeta(slide, element)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${name}`}
                              disabled={props.saving}
                              onClick={() => elements.removeValue(index)}
                            >
                              <Trash2Icon aria-hidden="true" />
                            </Button>
                            {element.kind === "image" ? (
                              <div className="basis-full">
                                <form.Field name={`elements[${index}].alt`}>
                                  {(field) => {
                                    const issue = issueOf(
                                      field.state.meta.errors
                                    );

                                    const fieldId = `alt-${index}-${element.fileId}`;
                                    const helpId = `${fieldId}-help`;
                                    const errorId = `${fieldId}-error`;
                                    const alt = field.state.value ?? "";

                                    const show =
                                      issue !== undefined &&
                                      (attempted || field.state.meta.isTouched);

                                    return (
                                      <Field>
                                        <div className="flex items-baseline justify-between gap-3">
                                          <FieldLabel htmlFor={fieldId}>
                                            Alt text
                                          </FieldLabel>
                                          <span className="text-xs text-muted-foreground tabular-nums">
                                            {alt.length} / {ALT_CHARACTERS}
                                          </span>
                                        </div>
                                        <Input
                                          id={fieldId}
                                          maxLength={ALT_CHARACTERS}
                                          value={alt}
                                          onValueChange={field.handleChange}
                                          onBlur={field.handleBlur}
                                          aria-invalid={show ? true : undefined}
                                          aria-describedby={describedBy(
                                            helpId,
                                            show ? errorId : undefined
                                          )}
                                        />
                                        <FieldDescription id={helpId}>
                                          Describe the image for people who
                                          cannot see it.
                                        </FieldDescription>
                                        {show ? (
                                          <FieldError id={errorId}>
                                            {ALT_COPY}
                                          </FieldError>
                                        ) : null}
                                      </Field>
                                    );
                                  }}
                                </form.Field>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {value.some(isData) ? (
                  <p className="flex gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
                    <SparklesIcon
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    <span>
                      Charts and figures come from your data.
                      {onAsk === undefined ? null : (
                        <>
                          {" To change one, "}
                          <button
                            type="button"
                            className={`font-semibold text-primary underline-offset-4 hover:underline ${focusRing}`}
                            onClick={() => {
                              if (
                                isEqual(form.state.values, slideInputOf(slide))
                              ) {
                                onAsk();
                              } else {
                                setAsking(true);
                              }
                            }}
                          >
                            open Ask
                          </button>
                          .
                        </>
                      )}
                    </span>
                  </p>
                ) : null}

                <div className="grid gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="sr-only"
                    tabIndex={-1}
                    // Hidden from the accessibility tree too: the button is the one control (6wz1.127).
                    aria-hidden="true"
                    aria-label="Add image"
                    aria-describedby={describedBy(
                      uploadError === null ? undefined : uploadErrorId
                    )}
                    onChange={(event) => {
                      const [file] = event.target.files ?? [];

                      event.target.value = "";
                      void addImage(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-fit"
                    disabled={
                      uploading || props.saving || imageRefusal !== undefined
                    }
                    focusableWhenDisabled
                    aria-describedby={describedBy(
                      imageRefusal === undefined ? imageHintId : imageReasonId,
                      uploadError === null ? undefined : uploadErrorId
                    )}
                    onClick={() => fileInput.current?.click()}
                  >
                    <ImagePlusIcon
                      aria-hidden="true"
                      data-icon="inline-start"
                    />
                    Add image
                  </Button>
                  {imageRefusal === undefined ? (
                    <FieldDescription id={imageHintId}>
                      PNG or JPEG.
                    </FieldDescription>
                  ) : (
                    <Reason id={imageReasonId}>{imageRefusal}</Reason>
                  )}
                  {uploadError === null ? null : (
                    <FieldError id={uploadErrorId}>{uploadError}</FieldError>
                  )}
                </div>
              </>
            );
          }}
        </form.Field>

        <ConfirmDialog
          open={asking}
          title="Discard your changes to this slide?"
          description="The changes you have not saved are dropped. Nothing was written yet."
          confirmLabel="Discard"
          danger={false}
          onConfirm={() => {
            setAsking(false);
            onAsk?.();
          }}
          onClose={() => setAsking(false)}
        />
      </div>

      <div className="border-t border-border">
        <SheetFooter className="flex-row justify-end max-md:*:flex-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={props.saving} disabled={uploading}>
            Save slide
          </Button>
        </SheetFooter>
      </div>
    </form>
  );
}
