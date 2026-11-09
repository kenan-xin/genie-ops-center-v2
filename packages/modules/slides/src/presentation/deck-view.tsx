"use client";

import {
  type AgentPageContext,
  useAgentPage,
} from "@genie/core/features/agent/panel";
import { PageHeader } from "@genie/core/features/shell";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  InfoNote,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
} from "@genie/ui";
import { useForm } from "@tanstack/react-form";
import { isEqual } from "es-toolkit";
import { useEffect, useId, useState } from "react";
import { z } from "zod";

import {
  type DeckChange,
  deckTitle,
  type ElementInput,
  slideInput,
  type SlideInput,
  textElement,
  titleElement,
} from "../contract.ts";
import { type ChangeFailure, ChangeRefusal } from "./change-refusal.tsx";
import { PresentMode } from "./present-mode.tsx";
import { SlideCanvas } from "./slide-canvas.tsx";
import {
  describedBy,
  issueOf,
  SlideEditor,
  slideInputOf,
} from "./slide-editor.tsx";
import { elementBoxes, figuresDate } from "./slide-layout.ts";
import { SlideStage } from "./slide-stage.tsx";
import { SlideEditorBar, StyleToolbar } from "./style-toolbar.tsx";
import {
  useDeck,
  useDeckChange,
  useExportDeck,
  useRefreshDeck,
  useUndoDeck,
  useUploadDeckImage,
} from "./use-deck.ts";
import type { DeckPageView, ShownSlide } from "./views.ts";

export type DeckViewProps = {
  readonly view: DeckPageView;
};

/** What an edit control captured when it opened, so a refetch never moves its target (R-53). */
type EditTarget = {
  readonly slide: ShownSlide;
  readonly number: number;
  readonly expectedHash: string;
};

type MenuTarget = EditTarget & {
  readonly index: number;
  readonly count: number;
};

type RenameTarget = {
  readonly title: string;
  readonly expectedHash: string;
};

type AddTarget = {
  readonly toIndex: number;
  readonly expectedHash: string;
};

/** The box one element of a slide draws at: its own, else the computed one. */
function boxOf(slide: ShownSlide, index: number) {
  const boxes = elementBoxes(slide.elements);

  return boxes.body.find((entry) => entry.index === index)?.box ?? boxes.title;
}

function titleOf(slide: ShownSlide): string {
  const title = slide.elements.find((element) => element.kind === "title");

  return title !== undefined && "text" in title ? title.text : "Slide";
}

function hasFigures(deck: DeckPageView["deck"]): boolean {
  return deck.slides.some((slide) =>
    slide.elements.some(
      (element) =>
        element.kind === "figure" ||
        element.kind === "chart" ||
        element.kind === "table"
    )
  );
}

function numberList(numbers: readonly number[]): string {
  if (numbers.length <= 1) return numbers.join("");

  return `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/** The note after a Refresh: the slides whose figures moved, so their claims get checked (D4). */
function refreshNote(numbers: readonly number[]): string {
  if (numbers.length === 0) return "No figure changed.";

  if (numbers.length === 1) {
    return `Figures changed on slide ${numberList(numbers)}. Check that its title still states the finding.`;
  }

  return `Figures changed on slides ${numberList(numbers)}. Check that their titles still state the finding.`;
}

const renameFormSchema = z.object({ title: deckTitle });

const addSlideSchema = z.object({
  title: titleElement.shape.text,
  text: z
    .string()
    .trim()
    .max(textElement.shape.text.maxLength ?? 280),
});

const ADD_HELP = "State the finding of this slide in one sentence.";

/** The Rename deck dialog's form, with the deck's title schema (CLAUDE.md, Forms). */
function RenameForm(props: {
  readonly initialTitle: string;
  readonly saving: boolean;
  readonly failure: ChangeFailure | null;
  readonly onReload: () => void;
  readonly onClose: () => void;
  readonly onSubmit: (title: string) => void;
}) {
  const titleId = useId();
  const errorId = useId();
  const [attempted, setAttempted] = useState(false);

  const form = useForm({
    defaultValues: { title: props.initialTitle },
    validators: {
      onMount: renameFormSchema,
      onChange: renameFormSchema,
      onSubmit: renameFormSchema,
    },
    onSubmitInvalid: () => setAttempted(true),
    onSubmit: ({ value }) => props.onSubmit(value.title),
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="title">
        {(field) => {
          const issue = issueOf(field.state.meta.errors);

          const show =
            issue !== undefined && (attempted || field.state.meta.isTouched);

          return (
            <Field>
              <FieldLabel htmlFor={titleId}>Title</FieldLabel>
              <Input
                id={titleId}
                value={field.state.value}
                onValueChange={field.handleChange}
                onBlur={field.handleBlur}
                aria-invalid={show ? true : undefined}
                aria-describedby={describedBy(show ? errorId : undefined)}
              />
              {show ? <FieldError id={errorId}>{issue}</FieldError> : null}
            </Field>
          );
        }}
      </form.Field>
      {props.failure === null ? null : (
        <ChangeRefusal failure={props.failure} onReload={props.onReload} />
      )}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={props.onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={props.saving}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The Add slide dialog's form, with the title and optional text element schemas. */
function AddSlideForm(props: {
  readonly saving: boolean;
  readonly failure: ChangeFailure | null;
  readonly onReload: () => void;
  readonly onClose: () => void;
  readonly onSubmit: (title: string, text: string) => void;
}) {
  const titleId = useId();
  const titleHelpId = useId();
  const titleErrorId = useId();
  const textId = useId();
  const textErrorId = useId();
  const [attempted, setAttempted] = useState(false);

  const form = useForm({
    defaultValues: { title: "", text: "" },
    validators: {
      onMount: addSlideSchema,
      onChange: addSlideSchema,
      onSubmit: addSlideSchema,
    },
    onSubmitInvalid: () => setAttempted(true),
    onSubmit: ({ value }) => props.onSubmit(value.title, value.text),
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="title">
        {(field) => {
          const issue = issueOf(field.state.meta.errors);

          const show =
            issue !== undefined && (attempted || field.state.meta.isTouched);

          return (
            <Field>
              <FieldLabel htmlFor={titleId}>Title</FieldLabel>
              <Input
                id={titleId}
                value={field.state.value}
                onValueChange={field.handleChange}
                onBlur={field.handleBlur}
                aria-invalid={show ? true : undefined}
                aria-describedby={describedBy(
                  titleHelpId,
                  show ? titleErrorId : undefined
                )}
              />
              <FieldDescription id={titleHelpId}>{ADD_HELP}</FieldDescription>
              {show ? <FieldError id={titleErrorId}>{issue}</FieldError> : null}
            </Field>
          );
        }}
      </form.Field>
      <form.Field name="text">
        {(field) => {
          const issue = issueOf(field.state.meta.errors);

          const show =
            issue !== undefined && (attempted || field.state.meta.isTouched);

          return (
            <Field>
              <FieldLabel htmlFor={textId}>Text</FieldLabel>
              <Textarea
                id={textId}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={show ? true : undefined}
                aria-describedby={describedBy(show ? textErrorId : undefined)}
              />
              {show ? <FieldError id={textErrorId}>{issue}</FieldError> : null}
            </Field>
          );
        }}
      </form.Field>
      {props.failure === null ? null : (
        <ChangeRefusal failure={props.failure} onReload={props.onReload} />
      )}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={props.onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={props.saving}>
          Add
        </Button>
      </DialogFooter>
    </form>
  );
}

/** One slide's menu. It keeps the slide, place and hash it opened with (R-53). */
function RailMenu(props: {
  readonly slide: ShownSlide;
  readonly index: number;
  readonly count: number;
  readonly expectedHash: string;
  readonly busy: boolean;
  readonly onEdit: (target: EditTarget) => void;
  readonly onMove: (target: MenuTarget, toIndex: number) => void;
  readonly onRemove: (target: MenuTarget) => void;
}) {
  const [opened, setOpened] = useState<MenuTarget | null>(null);

  const current: MenuTarget = opened ?? {
    slide: props.slide,
    number: props.index + 1,
    index: props.index,
    count: props.count,
    expectedHash: props.expectedHash,
  };

  return (
    <DropdownMenu
      onOpenChange={(open) =>
        setOpened(
          open
            ? {
                slide: props.slide,
                number: props.index + 1,
                index: props.index,
                count: props.count,
                expectedHash: props.expectedHash,
              }
            : null
        )
      }
    >
      <DropdownMenuTrigger
        disabled={props.busy}
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for slide ${props.index + 1}`}
          />
        }
      >
        <span aria-hidden="true">⋯</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={props.busy}
          onClick={() => props.onEdit(current)}
        >
          Edit slide
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={props.busy || current.index === 0}
          onClick={() => props.onMove(current, current.index - 1)}
        >
          Move earlier
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={props.busy || current.index === current.count - 1}
          onClick={() => props.onMove(current, current.index + 1)}
        >
          Move later
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={props.busy}
          onClick={() => props.onRemove(current)}
        >
          Remove slide
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One deck: its toolbar, its slide rail, the shown slide and the hand edits (R-52 to R-54). */
export function DeckView(props: DeckViewProps) {
  const { view } = props;
  const deckQuery = useDeck(view.deck);
  const deck = deckQuery.data ?? view.deck;
  const change = useDeckChange(deck);
  const undo = useUndoDeck(deck);
  const refresh = useRefreshDeck(deck);
  const upload = useUploadDeckImage(deck);
  const exporting = useExportDeck(deck);
  const [shown, setShown] = useState(0);

  // The selected element, of one slide: another shown slide starts with nothing selected.
  const [selection, setSelection] = useState<{
    readonly slideId: string;
    readonly index: number;
  } | null>(null);

  const [presenting, setPresenting] = useState(false);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const [editorFailure, setEditorFailure] = useState<ChangeFailure | null>(
    null
  );

  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [adding, setAdding] = useState<AddTarget | null>(null);
  const [failure, setFailure] = useState<ChangeFailure | null>(null);

  const [refreshNumbers, setRefreshNumbers] = useState<
    readonly number[] | null
  >(null);

  // One write runs at a time: a second control must not send a hash the first one moved.
  const busy =
    change.isPending ||
    undo.isPending ||
    refresh.isPending ||
    exporting.isPending;

  // A refetch may remove slides, so the shown index never points past the last one.
  const index = Math.min(shown, Math.max(deck.slides.length - 1, 0));

  const current = deck.slides[index];

  const selected =
    selection !== null && selection.slideId === current?.id
      ? selection.index
      : null;

  // The panel names the open deck and its shown slide (D21); a chat change reads the deck again.
  const context: AgentPageContext = {
    page: "Deck",
    record: { type: "slides-deck", id: deck.id },
  };

  if (current !== undefined) context.part = { type: "slide", id: current.id };

  useAgentPage({
    context,
    about:
      current === undefined ? deck.title : `${deck.title}, slide ${index + 1}`,
    onFinished: () => void deckQuery.refetch(),
  });

  // The open slide can go while the sheet is open. Its snapshot stays, and a reload is the way out.
  useEffect(() => {
    if (editing === null) return;

    if (deck.slides.some((slide) => slide.id === editing.slide.id)) return;

    setEditorFailure({ kind: "stale" });
  }, [deck.slides, editing]);

  function reload(): void {
    setFailure(null);
    setEditorFailure(null);

    void deckQuery.refetch().then((result) => {
      if (result.data !== undefined) renewTargets(result.data);
    });
  }

  /**
   * After a reload, an open control saves at the newer hash and from the newer slide. A gone slide
   * closes its control and puts the refusal on the page. The typed fields stay (I4).
   */
  function renewTargets(fresh: DeckPageView["deck"]): void {
    if (editing !== null) {
      const at = fresh.slides.findIndex(
        (slide) => slide.id === editing.slide.id
      );

      if (at === -1) {
        setEditing(null);
        setFailure({ kind: "stale" });
      } else {
        setEditing({
          slide: fresh.slides[at]!,
          number: at + 1,
          expectedHash: fresh.contentHash,
        });
      }
    }

    if (renaming !== null) {
      setRenaming({ ...renaming, expectedHash: fresh.contentHash });
    }

    if (adding !== null) {
      const at = Math.min(shown, Math.max(fresh.slides.length - 1, 0));

      setAdding({
        toIndex: fresh.slides.length === 0 ? 0 : at + 1,
        expectedHash: fresh.contentHash,
      });
    }
  }

  function saveSlide(input: SlideInput): void {
    if (editing === null) return;

    const parsed = slideInput.safeParse(input);
    const value = parsed.success ? parsed.data : input;

    // A choice that changes nothing sends nothing and spends no Undo entry.
    if (isEqual(value, slideInputOf(editing.slide))) {
      closeEditor();

      return;
    }

    setEditorFailure(null);
    change.mutate(
      {
        changes: [
          { op: "change-slide", slideId: editing.slide.id, slide: value },
        ],
        expectedHash: editing.expectedHash,
      },
      {
        onSuccess: closeEditor,
        onError: (error) =>
          setEditorFailure({
            kind: "change",
            slideNumber: editing.number,
            error,
          }),
      }
    );
  }

  function openEditor(target: EditTarget): void {
    setFailure(null);
    setEditorFailure(null);
    setEditing(target);
  }

  function closeEditor(): void {
    setEditing(null);
    setEditorFailure(null);
  }

  function sendStep(
    changes: readonly DeckChange[],
    options: {
      readonly expectedHash: string;
      readonly slideNumber?: number;
    }
  ): void {
    setFailure(null);
    change.mutate(
      { changes, expectedHash: options.expectedHash },
      {
        onError: (error) =>
          setFailure({
            kind: "change",
            slideNumber: options.slideNumber,
            error,
          }),
      }
    );
  }

  function undoLast(): void {
    setFailure(null);
    undo.mutate(undefined, {
      onError: (error) => setFailure({ kind: "undo", error }),
    });
  }

  function refreshData(): void {
    setFailure(null);
    refresh.mutate(undefined, {
      onSuccess: ({ deck: refreshed, changedSlides }) =>
        setRefreshNumbers(
          changedSlides
            .map(
              (id) => refreshed.slides.findIndex((slide) => slide.id === id) + 1
            )
            .filter((number) => number > 0)
        ),
      onError: (error) => setFailure({ kind: "refresh", error }),
    });
  }

  function exportToPowerPoint(): void {
    setFailure(null);
    exporting.mutate(undefined, {
      onSuccess: ({ url }) => window.location.assign(url),
      onError: (error) => setFailure({ kind: "export", error }),
    });
  }

  function openRename(): void {
    setFailure(null);
    setRenaming({ title: deck.title, expectedHash: deck.contentHash });
  }

  function submitRename(title: string): void {
    if (renaming === null) return;

    const trimmed = title.trim();

    if (trimmed === "") return;

    if (trimmed === renaming.title) {
      setRenaming(null);

      return;
    }

    setFailure(null);
    change.mutate(
      {
        changes: [{ op: "rename", title: trimmed }],
        expectedHash: renaming.expectedHash,
      },
      {
        onSuccess: () => setRenaming(null),
        onError: (error) => setFailure({ kind: "change", error }),
      }
    );
  }

  function openAdd(): void {
    setFailure(null);
    setAdding({
      toIndex: deck.slides.length === 0 ? 0 : index + 1,
      expectedHash: deck.contentHash,
    });
  }

  function submitAdd(title: string, text: string): void {
    if (adding === null) return;

    const trimmedTitle = title.trim();

    if (trimmedTitle === "") return;

    const elements: ElementInput[] = [{ kind: "title", text: trimmedTitle }];

    if (text.trim() !== "") {
      elements.push({ kind: "text", text: text.trim() });
    }

    setFailure(null);
    change.mutate(
      {
        changes: [
          {
            op: "add-slide",
            slide: { elements },
            toIndex: adding.toIndex,
          },
        ],
        expectedHash: adding.expectedHash,
      },
      {
        onSuccess: () => setAdding(null),
        onError: (error) => setFailure({ kind: "change", error }),
      }
    );
  }

  const pageRefusal =
    failure !== null &&
    editing === null &&
    renaming === null &&
    adding === null ? (
      <div className="mb-4">
        <ChangeRefusal failure={failure} onReload={reload} />
      </div>
    ) : null;

  return (
    <main>
      {/* 7.2: Present is the main action, Export beside it, the rest in More. The meta line is the
          readable figures date at every width; the scaled slide footer is tiny on a phone. */}
      <PageHeader
        title={deck.title}
        meta={
          <span data-figures-date="">
            {deck.slides.length === 1
              ? "1 slide"
              : `${deck.slides.length} slides`}{" "}
            · Figures as of {figuresDate(deck.figuresAsOf)}
          </span>
        }
        actions={
          <Button
            disabled={current === undefined || busy}
            onClick={() => setPresenting(true)}
          >
            Present
          </Button>
        }
        secondaryActions={
          <>
            <Button
              variant="secondary"
              disabled={current === undefined || busy}
              onClick={exportToPowerPoint}
            >
              {exporting.isPending ? "Exporting…" : "Export to PowerPoint"}
            </Button>
            {view.canWrite ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={busy}
                  render={
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label="More"
                      loading={refresh.isPending}
                    />
                  }
                >
                  <span aria-hidden="true">⋯</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openAdd}>
                    Add slide
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!hasFigures(deck)}
                    onClick={refreshData}
                  >
                    Refresh data
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openRename}>
                    Rename deck
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />
      {pageRefusal}
      {refreshNumbers === null ? null : (
        <div className="mb-4">
          <InfoNote size="md" role="status">
            {refreshNote(refreshNumbers)}
          </InfoNote>
        </div>
      )}
      {/* Undo beside the slide (7.2), also with no slide left, so the last removal is undoable. */}
      {view.canWrite ? (
        <div className="mb-2 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {current === undefined
              ? null
              : `Slide ${index + 1} of ${deck.slides.length}`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!deck.canUndo || busy}
            loading={undo.isPending}
            onClick={undoLast}
          >
            Undo
          </Button>
        </div>
      ) : null}
      {current === undefined ? (
        <EmptyState
          variant="framed"
          title="No slides yet"
          description="Add a slide, or create a deck by chat from the Slides list."
        />
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <nav
            aria-label="Slides"
            // 7.3: numbered previews, a column from 768 px and a strip that scrolls below it.
            className="flex gap-3 overflow-x-auto px-1 pt-1 pb-2 md:w-40 md:shrink-0 md:flex-col md:overflow-visible md:p-0"
          >
            {deck.slides.map((slide, slideIndex) => (
              <div
                key={slide.id}
                className="relative flex w-32 shrink-0 items-start gap-1.5 md:w-auto"
              >
                {/* The number is the button; its overlay makes the whole preview the target. */}
                <button
                  type="button"
                  aria-label={`Slide ${slideIndex + 1}: ${titleOf(slide)}`}
                  aria-current={slideIndex === index}
                  className="peer w-4 shrink-0 rounded-md text-end text-xs font-semibold text-muted-foreground tabular-nums outline-none after:absolute after:-inset-1 after:rounded-lg hover:after:bg-foreground/5 focus-visible:after:ring-2 focus-visible:after:ring-ring aria-current:text-foreground"
                  onClick={() => setShown(slideIndex)}
                >
                  {slideIndex + 1}
                </button>
                <div
                  data-slide-preview=""
                  inert
                  aria-hidden="true"
                  className="pointer-events-none min-w-0 flex-1 overflow-hidden rounded-md border border-border peer-aria-current:ring-2 peer-aria-current:ring-foreground"
                >
                  <SlideCanvas
                    slide={slide}
                    figuresAsOf={deck.figuresAsOf}
                    timeZone={view.timeZone}
                    theme={view.theme}
                    logoUrl={view.logoUrl}
                    images={deck.images}
                  />
                </div>
                {view.canWrite ? (
                  <div className="absolute top-0.5 right-0.5">
                    <RailMenu
                      slide={slide}
                      index={slideIndex}
                      count={deck.slides.length}
                      expectedHash={deck.contentHash}
                      busy={busy}
                      onEdit={openEditor}
                      onMove={(target, toIndex) =>
                        sendStep(
                          [
                            {
                              op: "move-slide",
                              slideId: target.slide.id,
                              toIndex,
                            },
                          ],
                          {
                            expectedHash: target.expectedHash,
                            slideNumber: target.number,
                          }
                        )
                      }
                      onRemove={(target) =>
                        sendStep(
                          [{ op: "remove-slide", slideId: target.slide.id }],
                          {
                            expectedHash: target.expectedHash,
                            slideNumber: target.number,
                          }
                        )
                      }
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </nav>
          {view.canWrite ? (
            <div data-shown-slide="" className="grid min-w-0 flex-1 gap-2">
              <SlideEditorBar
                slide={current}
                saving={busy}
                onSteps={(steps) =>
                  sendStep(steps, {
                    expectedHash: deck.contentHash,
                    slideNumber: index + 1,
                  })
                }
                onAdd={(kind) => {
                  if (kind === "image") {
                    openEditor({
                      slide: current,
                      number: index + 1,
                      expectedHash: deck.contentHash,
                    });

                    return;
                  }

                  const input = slideInputOf(current);

                  // The body goes after the title; the person writes it with Edit text.
                  sendStep(
                    [
                      {
                        op: "change-slide",
                        slideId: current.id,
                        slide: {
                          ...input,
                          elements: input.elements.toSpliced(
                            1,
                            0,
                            kind === "text"
                              ? { kind: "text", text: "Add your text." }
                              : { kind: "bullets", items: ["Add a point."] }
                          ),
                        },
                      },
                    ],
                    {
                      expectedHash: deck.contentHash,
                      slideNumber: index + 1,
                    }
                  );
                }}
              />
              {selected === null ||
              current.elements[selected] === undefined ? null : (
                <StyleToolbar
                  element={current.elements[selected]}
                  slideId={current.id}
                  index={selected}
                  box={boxOf(current, selected)}
                  saving={busy}
                  onStep={(step) =>
                    sendStep([step], {
                      expectedHash: deck.contentHash,
                      slideNumber: index + 1,
                    })
                  }
                  onEditText={() =>
                    openEditor({
                      slide: current,
                      number: index + 1,
                      expectedHash: deck.contentHash,
                    })
                  }
                />
              )}
              <SlideStage
                key={current.id}
                slide={current}
                figuresAsOf={deck.figuresAsOf}
                timeZone={view.timeZone}
                theme={view.theme}
                logoUrl={view.logoUrl}
                images={deck.images}
                selected={selected}
                onSelect={(at) =>
                  setSelection(
                    at === null ? null : { slideId: current.id, index: at }
                  )
                }
                saving={busy}
                onStep={(step) =>
                  sendStep([step], {
                    expectedHash: deck.contentHash,
                    slideNumber: index + 1,
                  })
                }
              />
            </div>
          ) : (
            <div
              data-shown-slide=""
              className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border"
            >
              <SlideCanvas
                slide={current}
                figuresAsOf={deck.figuresAsOf}
                timeZone={view.timeZone}
                theme={view.theme}
                logoUrl={view.logoUrl}
                images={deck.images}
              />
            </div>
          )}
        </div>
      )}
      <PresentMode
        view={{ ...view, deck }}
        startAt={index}
        open={presenting}
        onOpenChange={setPresenting}
      />

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Edit slide</SheetTitle>
            <SheetDescription>
              Change the words of this slide. Its stored figures stay as they
              are.
            </SheetDescription>
          </SheetHeader>
          {editorFailure === null ? null : (
            <div className="px-4">
              <ChangeRefusal failure={editorFailure} onReload={reload} />
            </div>
          )}
          {editing === null ? null : (
            <SlideEditor
              key={editing.slide.id}
              slide={editing.slide}
              saving={busy}
              onClose={closeEditor}
              onUpload={upload}
              onSave={saveSlide}
            />
          )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenaming(null);
            setFailure(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename deck</DialogTitle>
          </DialogHeader>
          {renaming === null ? null : (
            <RenameForm
              initialTitle={renaming.title}
              saving={busy}
              failure={failure}
              onReload={reload}
              onClose={() => {
                setRenaming(null);
                setFailure(null);
              }}
              onSubmit={submitRename}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(null);
            setFailure(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add slide</DialogTitle>
          </DialogHeader>
          {adding === null ? null : (
            <AddSlideForm
              saving={busy}
              failure={failure}
              onReload={reload}
              onClose={() => {
                setAdding(null);
                setFailure(null);
              }}
              onSubmit={submitAdd}
            />
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
