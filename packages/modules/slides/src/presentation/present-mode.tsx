"use client";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@genie/ui";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { SlideCanvas } from "./slide-canvas.tsx";
import type { DeckPageView } from "./views.ts";

export type PresentModeProps = {
  readonly view: DeckPageView;
  readonly startAt: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

/** A style object of CSS custom properties only; the classes read them. */
type CssVars = CSSProperties & {
  readonly [key: `--${string}`]: string | number;
};

const ASPECT = 960 / 540;

function clampIndex(value: number, count: number): number {
  return Math.min(Math.max(value, 0), Math.max(count - 1, 0));
}

/** A key press on a control activates it, so Space must not also move the deck. */
function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("button, a, input, select, textarea") !== null
  );
}

/**
 * One deck full screen (R-55, D11). The popup fills the viewport above the shell and the Ask
 * bubble; the slide is the largest 16:9 box above the control row. Browser fullscreen is asked
 * for only where the browser allows it, so an iPhone still gets the dialog alone.
 */
export function PresentMode(props: PresentModeProps) {
  const { view, startAt, open, onOpenChange } = props;
  const slides = view.deck.slides;
  const count = slides.length;
  const [shown, setShown] = useState(() => clampIndex(startAt, count));
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);
  const [popupElement, setPopupElement] = useState<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const requested = useRef(false);

  // The portal mounts after this component's first effect, so the elements arrive through state.
  const stageRef = useCallback((element: HTMLDivElement | null) => {
    stage.current = element;
    setStageElement(element);
  }, []);

  // The deck page's shown slide is where the next open starts.
  useEffect(() => {
    if (open) setShown(clampIndex(startAt, count));
  }, [open, startAt, count]);

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

  function move(step: number): void {
    setShown((current) => clampIndex(current + step, count));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
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

  const index = clampIndex(shown, count);
  const slide = slides[index];

  const width =
    stageSize.width === 0
      ? 0
      : Math.min(stageSize.width, stageSize.height * ASPECT);

  const widthStyle: CssVars = { "--present-slide-width": `${width}px` };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        ref={setPopupElement}
        showCloseButton={false}
        initialFocus={stage}
        onKeyDown={handleKeyDown}
        className="inset-0 z-50 overflow-visible md:inset-0 md:w-auto md:translate-none"
      >
        {/* The popup's own card, border and padding stay behind this viewport layer. */}
        <div className="fixed inset-0 flex flex-col bg-black text-white">
          <DialogTitle className="sr-only">
            Present {view.deck.title}
          </DialogTitle>
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
          <div className="flex flex-wrap items-center justify-center gap-2 p-4">
            <Button
              variant="secondary"
              disabled={index === 0}
              focusableWhenDisabled
              onClick={() => move(-1)}
            >
              Previous slide
            </Button>
            <Button
              variant="secondary"
              disabled={index >= count - 1}
              focusableWhenDisabled
              onClick={() => move(1)}
            >
              Next slide
            </Button>
            <span
              aria-live="polite"
              aria-atomic="true"
              className="min-w-16 text-center text-white tabular-nums"
            >
              {count === 0 ? 0 : index + 1} / {count}
            </span>
            <DialogClose render={<Button variant="secondary" />}>
              Exit
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
