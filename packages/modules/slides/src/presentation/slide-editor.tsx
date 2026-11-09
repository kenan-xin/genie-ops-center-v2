"use client";

import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  SheetFooter,
  Textarea,
} from "@genie/ui";
import { useForm } from "@tanstack/react-form";
import { useId, useRef, useState } from "react";

import { type ElementInput, slideInput, type SlideInput } from "../contract.ts";
import type { ShownElement, ShownSlide } from "./views.ts";

/** The two images the schema lets one slide show. */
const VISUAL_LIMIT = 2;

/** The schema's bullet limit, so the person meets it before the server does. */
const BULLET_LIMIT = 5;

const IMAGE_COPY = "Upload a PNG or JPEG image.";

const ALT_COPY = "Add alt text for this image.";

export type SlideEditorProps = {
  readonly slide: ShownSlide;
  readonly saving?: boolean;
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

function visualLabel(element: ElementInput): string {
  if (element.kind === "image") {
    return element.alt.trim() === "" ? "Image" : element.alt;
  }

  if (
    element.kind !== "figure" &&
    element.kind !== "chart" &&
    element.kind !== "table"
  ) {
    return "Element";
  }

  // SAFETY: every data element comes from the stored slide, so its chart is the server's
  // PanelConfig, whose title the panel schema guarantees.
  const chart = element.chart as { readonly title: string };

  return chart.title;
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
 * never sends the notes: they save per pause, and a Done in the sheet must not overwrite the text
 * another pause already saved.
 */
export function slideInputOf(slide: ShownSlide): SlideInput {
  return {
    elements: slide.elements.map(inputOfElement),
    background: slide.background,
  };
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
  const { slide, onSave, onUpload } = props;
  const titleId = useId();
  const titleHelpId = useId();
  const titleErrorId = useId();
  const textId = useId();
  const textErrorId = useId();
  const bulletId = useId();
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
              ? { kind: "bullets", items: [...items] }
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
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4">
        <form.Field name="elements[0].text">
          {(field) => {
            const issue = issueOf(field.state.meta.errors);

            const show =
              issue !== undefined && (attempted || field.state.meta.isTouched);

            return (
              <Field>
                <FieldLabel htmlFor={titleId}>Title</FieldLabel>
                <Input
                  id={titleId}
                  value={field.state.value ?? ""}
                  onValueChange={field.handleChange}
                  onBlur={field.handleBlur}
                  aria-invalid={show ? true : undefined}
                  aria-describedby={describedBy(
                    titleHelpId,
                    show ? titleErrorId : undefined
                  )}
                />
                <FieldDescription id={titleHelpId}>
                  State the finding of this slide in one sentence.
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

            const bodyIndex = value.findIndex(
              (element) => element.kind === "text" || element.kind === "bullets"
            );

            const body = bodyIndex === -1 ? undefined : value[bodyIndex];
            const visuals = value.filter(isVisual).length;

            return (
              <>
                {body?.kind === "text" ? (
                  <form.Field name={`elements[${bodyIndex}].text`}>
                    {(field) => {
                      const issue = issueOf(field.state.meta.errors);

                      const show =
                        issue !== undefined &&
                        (attempted || field.state.meta.isTouched);

                      return (
                        <Field>
                          <FieldLabel htmlFor={textId}>Text</FieldLabel>
                          <Textarea
                            id={textId}
                            value={field.state.value ?? ""}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            onBlur={field.handleBlur}
                            aria-invalid={show ? true : undefined}
                            aria-describedby={describedBy(
                              show ? textErrorId : undefined
                            )}
                          />
                          {show ? (
                            <FieldError id={textErrorId}>{issue}</FieldError>
                          ) : null}
                        </Field>
                      );
                    }}
                  </form.Field>
                ) : null}

                {body?.kind === "bullets" ? (
                  <div className="grid gap-2">
                    {body.items.map((item, bulletIndex) => (
                      <form.Field
                        key={`bullet-${bulletIndex}`}
                        name={`elements[${bodyIndex}].items[${bulletIndex}]`}
                      >
                        {(field) => {
                          const issue = issueOf(field.state.meta.errors);
                          const fieldId = `${bulletId}-${bulletIndex}`;
                          const errorId = `${fieldId}-error`;

                          const show =
                            issue !== undefined &&
                            (attempted || field.state.meta.isTouched);

                          return (
                            <Field>
                              <FieldLabel htmlFor={fieldId}>
                                Bullet {bulletIndex + 1}
                              </FieldLabel>
                              <div className="flex items-center gap-2">
                                <Input
                                  id={fieldId}
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
                                  size="sm"
                                  disabled={props.saving}
                                  onClick={() =>
                                    changeBullets(bodyIndex, (items) =>
                                      items.filter(
                                        (_, at) => at !== bulletIndex
                                      )
                                    )
                                  }
                                >
                                  Remove bullet {bulletIndex + 1}
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
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={
                        body.items.length >= BULLET_LIMIT || props.saving
                      }
                      onClick={() =>
                        changeBullets(bodyIndex, (items) => [...items, ""])
                      }
                    >
                      Add bullet
                    </Button>
                  </div>
                ) : null}

                {body === undefined ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={props.saving}
                      onClick={() =>
                        elements.insertValue(1, { kind: "text", text: "" })
                      }
                    >
                      Add text
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={props.saving}
                      onClick={() =>
                        elements.insertValue(1, {
                          kind: "bullets",
                          items: [""],
                        })
                      }
                    >
                      Add bullets
                    </Button>
                  </div>
                ) : null}

                {value.map((element, index) =>
                  isVisual(element) ? (
                    <div
                      key={`visual-${index}-${element.kind}`}
                      className="grid gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm">
                          {visualLabel(element)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={props.saving}
                          onClick={() => elements.removeValue(index)}
                        >
                          Remove
                        </Button>
                      </div>
                      {element.kind === "image" ? (
                        <form.Field name={`elements[${index}].alt`}>
                          {(field) => {
                            const issue = issueOf(field.state.meta.errors);
                            const fieldId = `alt-${index}-${element.fileId}`;
                            const helpId = `${fieldId}-help`;
                            const errorId = `${fieldId}-error`;

                            const show =
                              issue !== undefined &&
                              (attempted || field.state.meta.isTouched);

                            return (
                              <Field>
                                <FieldLabel htmlFor={fieldId}>
                                  Alt text
                                </FieldLabel>
                                <Input
                                  id={fieldId}
                                  value={field.state.value ?? ""}
                                  onValueChange={field.handleChange}
                                  onBlur={field.handleBlur}
                                  aria-invalid={show ? true : undefined}
                                  aria-describedby={describedBy(
                                    helpId,
                                    show ? errorId : undefined
                                  )}
                                />
                                <FieldDescription id={helpId}>
                                  Describe the image for people who cannot see
                                  it.
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
                      ) : null}
                    </div>
                  ) : null
                )}

                {visuals < VISUAL_LIMIT ? (
                  <div className="grid gap-2">
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="sr-only"
                      tabIndex={-1}
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
                      disabled={uploading || props.saving}
                      aria-describedby={describedBy(
                        uploadError === null ? undefined : uploadErrorId
                      )}
                      onClick={() => fileInput.current?.click()}
                    >
                      Add image
                    </Button>
                    {uploadError === null ? null : (
                      <FieldError id={uploadErrorId}>{uploadError}</FieldError>
                    )}
                  </div>
                ) : null}
              </>
            );
          }}
        </form.Field>
      </div>

      <SheetFooter>
        <Button type="submit" loading={props.saving} disabled={uploading}>
          Save slide
        </Button>
      </SheetFooter>
    </form>
  );
}
