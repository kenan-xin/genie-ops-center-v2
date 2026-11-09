"use client";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  Kbd,
} from "@genie/ui";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { type DeckSync, openDeckSync } from "./deck-sync.ts";
import { SlideCanvas } from "./slide-canvas.tsx";
import type { DeckPageView } from "./views.ts";

export type PresentModeProps = {
  readonly view: DeckPageView;
  readonly startAt: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** How long the controls stay after the last move or key; stories pass a short one. */
  readonly idleMs?: number | undefined;
};

/** The prototype's delay before the controls fade (7.5). */
const IDLE_MS = 2500;

/** A style object of CSS custom properties only; the classes read them. */
export type CssVars = CSSProperties & {
  readonly [key: `--${string}`]: string | number;
};

export const ASPECT = 960 / 540;

export function clampIndex(value: number, count: number): number {
  return Math.min(Math.max(value, 0), Math.max(count - 1, 0));
}

/** A key press on a control activates it, so Space must not also move the deck. */
export function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("button, a, input, select, textarea") !== null
  );
}

/**
 * One deck full screen (R-55, D11). The popup fills the viewport above the shell and the Ask
 * bubble; the slide is the largest 16:9 box above the control row. The controls fade when idle
 * and stay on a touch screen (7.5). Browser fullscreen is asked
 * for only where the browser allows it, so an iPhone still gets the dialog alone.
 */
export function PresentMode(props: PresentModeProps) {
  const { view, startAt, open, onOpenChange } = props;
  const idleMs = props.idleMs ?? IDLE_MS;
  const slides = view.deck.slides;
  const count = slides.length;
  const [shown, setShown] = useState(() => clampIndex(startAt, count));
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);
  const [popupElement, setPopupElement] = useState<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const requested = useRef(false);
  const sync = useRef<DeckSync | null>(null);
  // The controls show after a move or a key and fade when idle; a touch screen keeps them (7.5).
  const [awake, setAwake] = useState(true);
  const [touch, setTouch] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const wake = useCallback(() => {
    setAwake(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setAwake(false), idleMs);
  }, [idleMs]);

  useEffect(() => {
    if (!open) return;

    // Nothing hovers on a touch screen, so nothing would bring the controls back.
    setTouch(matchMedia("(hover: none)").matches);
    wake();

    return () => clearTimeout(idleTimer.current);
  }, [open, wake]);

  // The portal mounts after this component's first effect, so the elements arrive through state.
  const stageRef = useCallback((element: HTMLDivElement | null) => {
    stage.current = element;
    setStageElement(element);
  }, []);

  // The deck page's shown slide is where the next open starts.
  useEffect(() => {
    if (open) setShown(clampIndex(startAt, count));
  }, [open, startAt, count]);

  // The presenter window reads the newest render through these, and the channel stays open.
  const shownNow = useEffectEvent(() => clampIndex(shown, count));

  const openingIndex = useEffectEvent(() => clampIndex(startAt, count));

  const follow = useEffectEvent((target: number) =>
    setShown(clampIndex(target, count))
  );

  // S7-45: while open, the deck's channel carries this slide to the presenter window and back.
  useEffect(() => {
    if (!open) return;

    const end = openDeckSync(view.deck.id, (message) => {
      if (message.kind === "ask") post(shownNow());
      else if (message.kind === "show" && message.from === "presenter") {
        follow(message.index);
      }
    });

    function post(target: number): void {
      end.post({ kind: "show", index: target, from: "audience" });
    }

    sync.current = end;
    post(openingIndex());

    return () => {
      end.post({ kind: "closed" });
      end.close();
      sync.current = null;
    };
  }, [open, view.deck.id]);

  // The slide takes the largest 16:9 box the stage holds, above the control row.
  useEffect(() => {
    if (stageElement === null) return;

    const measure = () =>
      setStageSize({
        width: stageElement.clientWidth,
        height: stageElement.clientHeight,
      });

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(stageElement);

    return () => observer.disconnect();
  }, [stageElement]);

  // One request per open, and a refusal is ignored (D11).
  useEffect(() => {
    if (!open) {
      requested.current = false;

      return;
    }

    if (popupElement === null || requested.current) return;

    requested.current = true;

    if (!document.fullscreenEnabled) return;

    void Promise.resolve(popupElement.requestFullscreen()).catch(() => {});
  }, [open, popupElement]);

  function changeOpen(next: boolean): void {
    if (!next && document.fullscreenElement) {
      void Promise.resolve(document.exitFullscreen?.()).catch(() => {});
    }

    onOpenChange(next);
  }

  const index = clampIndex(shown, count);

  function move(step: number): void {
    const target = clampIndex(index + step, count);

    if (target === index) return;

    setShown(target);
    sync.current?.post({ kind: "show", index: target, from: "audience" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    wake();

    switch (event.key) {
      case "ArrowRight":
      case "PageDown":
        event.preventDefault();
        move(1);

        return;
      case "ArrowLeft":
      case "PageUp":
        event.preventDefault();
        move(-1);

        return;
      case " ":
        if (isControl(event.target)) return;

        event.preventDefault();
        move(1);

        return;
      default:
        return;
    }
  }

  const slide = slides[index];

  const width =
    stageSize.width === 0
      ? 0
      : Math.min(stageSize.width, stageSize.height * ASPECT);

  const widthStyle: CssVars = { "--present-slide-width": `${width}px` };

  const controlsShown = awake || touch;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        ref={setPopupElement}
        showCloseButton={false}
        initialFocus={stage}
        onKeyDown={handleKeyDown}
        onPointerMove={wake}
        onPointerDown={(event) => {
          if (event.pointerType === "touch") setTouch(true);

          wake();
        }}
        className="inset-0 z-50 overflow-visible md:inset-0 md:w-auto md:translate-none"
      >
        {/* The popup's own card, border and padding stay behind this viewport layer. */}
        <div className="fixed inset-0 flex flex-col bg-black text-white">
          <DialogTitle className="sr-only">
            Present {view.deck.title}
          </DialogTitle>
          {/* A row on the black above the slide, so the hints never cover its corner (7.5). */}
          {touch ? null : (
            <p
              aria-hidden="true"
              data-shown={controlsShown ? "" : undefined}
              className="flex h-8 shrink-0 items-end justify-end gap-1 px-5 text-xs text-white/70 opacity-0 data-shown:opacity-100 motion-safe:transition-opacity motion-safe:duration-500"
            >
              <Kbd>←</Kbd> <Kbd>→</Kbd> move · <Kbd>Esc</Kbd> exits
            </p>
          )}
          {/* The padding is the slide's margin; the measured box inside it has none. */}
          <div className="flex min-h-0 flex-1 overflow-hidden p-4">
            <div
              ref={stageRef}
              tabIndex={-1}
              data-present-stage=""
              className="flex w-full items-center justify-center outline-none"
            >
              {slide === undefined || width === 0 ? null : (
                <div className="w-(--present-slide-width)" style={widthStyle}>
                  <SlideCanvas
                    slide={slide}
                    figuresAsOf={view.deck.figuresAsOf}
                    timeZone={view.timeZone}
                    theme={view.theme}
                    logoUrl={view.logoUrl}
                    images={view.deck.images}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-center p-4">
            {/* Quiet controls over the black: they fade when idle, and stay while one has focus. */}
            <div
              role="toolbar"
              aria-label="Presentation"
              data-shown={controlsShown ? "" : undefined}
              className="flex items-center gap-0.5 rounded-full bg-white/10 p-1 opacity-0 focus-within:opacity-100 data-shown:opacity-100 motion-safe:transition-opacity motion-safe:duration-500"
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous slide"
                disabled={index === 0}
                focusableWhenDisabled
                // oxlint-disable-next-line shadcn/no-restyle -- round light-on-black control of present mode (7.5)
                className="rounded-full text-white hover:bg-white/15 hover:text-white"
                onClick={() => move(-1)}
              >
                <span aria-hidden="true" className="pointer-events-none">
                  ←
                </span>
              </Button>
              <span
                aria-live="polite"
                aria-atomic="true"
                className="min-w-14 px-1.5 text-center text-sm text-white tabular-nums"
              >
                {count === 0 ? 0 : index + 1} / {count}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next slide"
                disabled={index >= count - 1}
                focusableWhenDisabled
                // oxlint-disable-next-line shadcn/no-restyle -- round light-on-black control of present mode (7.5)
                className="rounded-full text-white hover:bg-white/15 hover:text-white"
                onClick={() => move(1)}
              >
                <span aria-hidden="true" className="pointer-events-none">
                  →
                </span>
              </Button>
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/25" />
              <DialogClose
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Exit"
                    // oxlint-disable-next-line shadcn/no-restyle -- round light-on-black control of present mode (7.5)
                    className="rounded-full text-white hover:bg-white/15 hover:text-white"
                  />
                }
              >
                <span aria-hidden="true" className="pointer-events-none">
                  ✕
                </span>
              </DialogClose>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
