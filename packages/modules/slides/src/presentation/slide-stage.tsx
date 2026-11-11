"use client";

import { Kbd } from "@genie/ui";
import { useDebouncer } from "@tanstack/react-pacer";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type DeckChange,
  type ElementBox,
  elementName,
  SLIDE_CANVAS,
} from "../contract.ts";
import {
  type CanvasGesture,
  type CanvasResizeHandle,
  createCanvasGestureController,
  resolveCanvasNudge,
} from "../lib/canvas-interactions/canvas-interactions.ts";
import { boxStep, gestureBox, movedBox } from "./canvas-adapter.ts";
import { SlideCanvas, type SlideCanvasProps } from "./slide-canvas.tsx";
import { elementBoxes } from "./slide-layout.ts";
import type { ShownSlide } from "./views.ts";

export type SlideStageHandle = {
  /** Saves a waiting arrow-key run now. */
  readonly flush: () => void;
};

export type SlideStageProps = SlideCanvasProps & {
  readonly ref?: Ref<SlideStageHandle> | undefined;
  /** The index of the selected element, or null. */
  readonly selected: number | null;
  readonly onSelect: (index: number | null) => void;
  /**
   * One gesture, nudge run or Position press: one step, one save, one Undo entry. An answer of
   * false (the save was refused) draws that element at its stored box again.
   */
  readonly onStep: (step: DeckChange) => Promise<boolean> | void;
  readonly saving?: boolean;
  /** The waiting arrow run's box after each press, and null when its save starts. */
  readonly onRunBox?:
    | ((
        run: { readonly index: number; readonly box: ElementBox } | null
      ) => void)
    | undefined;
};

/** Arrow keys move 8, and 1 with Shift (prototype hint line). */
const NUDGE = { amount: 8, acceleratedAmount: 1 };

/** A run of arrow presses within this time is one save (P01-8). */
const NUDGE_RUN_MS = 800;

const HANDLES = [
  "nw",
  "ne",
  "sw",
  "se",
] as const satisfies readonly CanvasResizeHandle[];

const HANDLE_CLASS = {
  nw: "-top-1.5 -left-1.5 cursor-nwse-resize",
  ne: "-top-1.5 -right-1.5 cursor-nesw-resize",
  sw: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
  se: "-right-1.5 -bottom-1.5 cursor-nwse-resize",
} as const;

type CssVars = CSSProperties & {
  readonly [key: `--${string}`]: string | number;
};

/** A length in percent of a canvas side, so the layer matches the scaled slide at every width. */
const percent = (value: number, side: number) => `${(value / side) * 100}%`;

const pointerOf = (event: PointerEvent<HTMLElement>) => ({
  x: event.clientX,
  y: event.clientY,
  shiftKey: event.shiftKey,
});

/** The slide with one element drawn at a preview box, while a gesture or a nudge run lasts. */
function withBox(
  slide: ShownSlide,
  index: number,
  box: ElementBox
): ShownSlide {
  return {
    ...slide,
    elements: slide.elements.map((element, at) =>
      at === index ? { ...element, box } : element
    ),
  };
}

/**
 * The editable slide (S7-43): each element is a button over the canvas. A selected element moves
 * by drag, resizes by its four corner handles, and nudges with the arrow keys. Each gesture or
 * nudge run calls `onStep` once with a box snapped and kept inside the slide.
 */
export function SlideStage(props: SlideStageProps) {
  const { slide, selected, onSelect, onStep } = props;
  const layer = useRef<HTMLDivElement>(null);

  const [preview, setPreview] = useState<{
    readonly index: number;
    readonly box: ElementBox;
  } | null>(null);

  const [seenSlide, setSeenSlide] = useState(slide);

  // A new read of the slide replaces the preview: the save landed, or another one did.
  if (slide !== seenSlide) {
    setSeenSlide(slide);
    setPreview(null);
  }

  const shown =
    preview === null ? slide : withBox(slide, preview.index, preview.box);

  const boxes = elementBoxes(shown.elements);

  const boxOf = (index: number): ElementBox | undefined =>
    index === 0
      ? boxes.title
      : boxes.body.find((entry) => entry.index === index)?.box;

  const start = useRef<{
    readonly index: number;
    readonly box: ElementBox;
  } | null>(null);

  // The newest slide and callback for the controller and the nudge run, which outlive a render:
  // the deck page passes a new onStep each render, and a press re-renders it by selecting.
  const latest = useRef({ slide, onStep, onRunBox: props.onRunBox });

  useEffect(() => {
    latest.current = { slide, onStep, onRunBox: props.onRunBox };
  });

  // Calls onStep at once (before the first await), so a flush on unmount still saves.
  async function saveBox(index: number, box: ElementBox): Promise<void> {
    const saved = await latest.current.onStep(
      boxStep(latest.current.slide.id, index, box)
    );

    // Another element's preview stays: only the refused one goes back.
    if (saved === false) {
      setPreview((current) => (current?.index === index ? null : current));
    }
  }

  const controller = useMemo(
    () =>
      createCanvasGestureController<number>({
        capabilities: { duplicate: false },
        adapter: {
          preview: (gesture: CanvasGesture<number>) => {
            const from = start.current;

            const element =
              from === null
                ? undefined
                : latest.current.slide.elements[from.index];

            if (from === null || element === undefined) {
              return { handled: false, reason: "unhandled" };
            }

            setPreview({
              index: from.index,
              box: gestureBox(gesture, from.box, element.kind),
            });

            return { handled: true };
          },
          commit: (gesture: CanvasGesture<number>) => {
            const from = start.current;

            const element =
              from === null
                ? undefined
                : latest.current.slide.elements[from.index];

            if (from === null || element === undefined) {
              return { handled: false, reason: "unhandled" };
            }

            void saveBox(
              from.index,
              gestureBox(gesture, from.box, element.kind)
            );

            return { handled: true };
          },
          cancel: () => {
            setPreview(null);

            return { handled: true };
          },
        },
      }),
    []
  );

  const nudgeRun = useRef<{
    readonly index: number;
    readonly box: ElementBox;
  } | null>(null);

  function commitRun(): void {
    const run = nudgeRun.current;

    // Stays above the calls below: the save's own pageWrite flushes again and re-enters here.
    nudgeRun.current = null;

    if (run !== null) {
      latest.current.onRunBox?.(null);
      void saveBox(run.index, run.box);
    }
  }

  // Pacer cancels a waiting call on unmount by default; a slide switch must still save the run.
  const nudge = useDebouncer(commitRun, {
    wait: NUDGE_RUN_MS,
    onUnmount: (debouncer) => debouncer.flush(),
  });

  // The deck page saves the run before each of its writes, so Undo or Position lands after it.
  useImperativeHandle(props.ref, () => ({ flush: () => nudge.flush() }));

  function pointerDown(
    event: PointerEvent<HTMLElement>,
    index: number,
    handle?: CanvasResizeHandle
  ): void {
    const rect = layer.current?.getBoundingClientRect();
    const box = boxOf(index);

    if (rect === undefined || box === undefined || props.saving === true)
      return;

    // The box above came from the preview, so the gesture starts where the run left the element.
    nudge.flush();
    event.stopPropagation();
    onSelect(index);
    start.current = { index, box };

    const pointer = {
      x: event.clientX,
      y: event.clientY,
      shiftKey: event.shiftKey,
    };

    const viewport = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };

    controller.pointerDown(
      handle === undefined
        ? {
            kind: "move",
            objectIds: [index],
            pointer,
            viewport,
            canvas: SLIDE_CANVAS,
          }
        : {
            kind: "resize",
            objectIds: [index],
            pointer,
            viewport,
            canvas: SLIDE_CANVAS,
            handle,
            rect: { x: box.x, y: box.y, width: box.w, height: box.h },
          }
    );

    // A synthetic event has no live pointer to capture; the layer's own handlers still run.
    if (event.currentTarget.hasPointerCapture?.(event.pointerId) === false) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic pointer id cannot be captured; nothing to undo.
      }
    }
  }

  function keyDown(event: KeyboardEvent<HTMLElement>, index: number): void {
    if (event.key === "Escape") {
      onSelect(null);

      return;
    }

    const step = resolveCanvasNudge(
      { key: event.key, shiftKey: event.shiftKey },
      NUDGE
    );

    // Another element's waiting run saves first, with its own box.
    if (nudgeRun.current !== null && nudgeRun.current.index !== index) {
      nudge.flush();
    }

    const element = slide.elements[index];
    const from = nudgeRun.current?.box ?? boxOf(index);

    if (step === null || element === undefined || from === undefined) return;

    event.preventDefault();

    const box = movedBox(from, step.delta, element.kind);

    nudgeRun.current = { index, box };
    setPreview({ index, box });
    props.onRunBox?.({ index, box });
    nudge.maybeExecute();
  }

  return (
    <div className="grid gap-2">
      <div className="relative overflow-hidden rounded-lg border border-border">
        <SlideCanvas {...props} slide={shown} />
        <div
          ref={layer}
          role="group"
          aria-label="Slide editing"
          className="absolute inset-0"
          onPointerDown={() => onSelect(null)}
          onPointerMove={(event) => controller.pointerMove(pointerOf(event))}
          onPointerUp={(event) => controller.pointerUp(pointerOf(event))}
          onPointerCancel={() => controller.cancel()}
        >
          {shown.elements.map((element, index) => {
            const box = boxOf(index);

            if (box === undefined) return null;

            const isSelected = selected === index;

            return (
              <button
                key={`${index}-${element.kind}`}
                type="button"
                aria-label={elementName(element)}
                aria-pressed={isSelected}
                data-stage-element={index}
                className={`absolute top-(--hit-y) left-(--hit-x) h-(--hit-h) w-(--hit-w) touch-none rounded-none outline-offset-2 ${
                  isSelected
                    ? "cursor-move ring-2 ring-primary"
                    : "cursor-pointer hover:ring-1 hover:ring-primary/60"
                }`}
                style={
                  // SAFETY: CSS custom properties are not in React's style type; this object holds only them.
                  {
                    "--hit-x": percent(box.x, SLIDE_CANVAS.width),
                    "--hit-y": percent(box.y, SLIDE_CANVAS.height),
                    "--hit-w": percent(box.w, SLIDE_CANVAS.width),
                    "--hit-h": percent(box.h, SLIDE_CANVAS.height),
                  } as CssVars
                }
                onPointerDown={(event) => pointerDown(event, index)}
                onKeyDown={(event) => keyDown(event, index)}
                onClick={() => onSelect(index)}
              >
                {isSelected
                  ? HANDLES.map((handle) => (
                      <span
                        key={handle}
                        aria-hidden="true"
                        data-handle={handle}
                        className={`absolute size-3 border-2 border-primary bg-background after:absolute after:-inset-2 pointer-coarse:after:-inset-4 ${HANDLE_CLASS[handle]}`}
                        onPointerDown={(event) =>
                          pointerDown(event, index, handle)
                        }
                      />
                    ))
                  : null}
              </button>
            );
          })}
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        Drag to move. Drag a handle to resize, or use Position. <Kbd>←</Kbd>
        <Kbd>↑</Kbd>
        <Kbd>→</Kbd>
        <Kbd>↓</Kbd> move 8, with <Kbd>Shift</Kbd> 1. <Kbd>Esc</Kbd> deselects.
      </p>
    </div>
  );
}
