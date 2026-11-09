"use client";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  Kbd,
} from "@genie/ui";
import { Pause, Play, RotateCcw } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { type DeckSync, formatElapsed, openDeckSync } from "./deck-sync.ts";
import {
  ASPECT,
  clampIndex,
  type CssVars,
  isControl,
} from "./present-mode.tsx";
import { SlideCanvas } from "./slide-canvas.tsx";
import { useDeck } from "./use-deck.ts";
import type { DeckPageView, ShownSlide } from "./views.ts";

export type PresenterViewProps = {
  readonly view: DeckPageView;
  readonly onExit: () => void;
};

/** Where the audience window stands: unheard yet, following, or closed. */
type Audience = "unheard" | "follows" | "closed";

/** One labelled panel of the presenter; the label names the region. */
function Panel(props: {
  readonly label: string;
  readonly aside?: string | undefined;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={props.label}
      className={`flex min-h-0 min-w-0 flex-col gap-2 ${props.className ?? ""}`}
    >
      <h2 className="flex justify-between gap-2 text-xs font-bold tracking-wider text-white/75 uppercase">
        <span>{props.label}</span>
        {props.aside === undefined ? null : (
          <span className="tabular-nums">{props.aside}</span>
        )}
      </h2>
      {props.children}
    </section>
  );
}

/**
 * The presenter window (S7-45, variant A): the current slide on the left, the next slide and the
 * speaker notes on the right, a timer in the top bar. It follows and moves the audience window
 * over the deck's channel. It reads the deck with `useDeck`, so a notes change shows within a poll.
 */
export function PresenterView(props: PresenterViewProps) {
  const { view, onExit } = props;
  const deck = useDeck(view.deck).data ?? view.deck;
  const slides = deck.slides;
  const count = slides.length;
  const [shown, setShown] = useState(0);
  const [audience, setAudience] = useState<Audience>("unheard");
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const sync = useRef<DeckSync | null>(null);
  const main = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  // The current slide takes the largest 16:9 box of its cell, as in present mode.
  useEffect(() => {
    if (stage === null) return;

    const measure = () =>
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight });

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(stage);

    return () => observer.disconnect();
  }, [stage]);

  useEffect(() => {
    const end = openDeckSync(deck.id, (message) => {
      if (message.kind === "show") {
        setShown(message.index);

        if (message.from === "audience") setAudience("follows");
      } else if (message.kind === "closed") {
        setAudience("closed");
      }
    });

    sync.current = end;
    // Present mode answers with the slide it shows.
    end.post({ kind: "ask" });

    return () => {
      sync.current = null;
      end.close();
    };
  }, [deck.id]);

  useEffect(() => {
    if (!running) return;

    const timer = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);

    return () => clearInterval(timer);
  }, [running]);

  const width = Math.min(stageSize.width, stageSize.height * ASPECT);
  const widthStyle: CssVars = { "--present-slide-width": `${width}px` };
  const index = clampIndex(shown, count);
  const slide = slides[index];
  const next = slides[index + 1];

  function move(step: number): void {
    const target = clampIndex(index + step, count);

    if (target === index) return;

    setShown(target);
    sync.current?.post({ kind: "show", index: target, from: "presenter" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // Inside the notes, Space and the page keys scroll them; the arrows still move the slides.
    const inNotes =
      event.target instanceof Element &&
      event.target.closest("[data-presenter-notes]") !== null;

    if (inNotes && [" ", "PageUp", "PageDown"].includes(event.key)) return;

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

  const canvas = (shownSlide: ShownSlide) => (
    <SlideCanvas
      slide={shownSlide}
      figuresAsOf={deck.figuresAsOf}
      timeZone={view.timeZone}
      theme={view.theme}
      logoUrl={view.logoUrl}
      images={deck.images}
    />
  );

  const notes = slide?.notes?.split("\n").filter((line) => line.trim() !== "");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onExit();
      }}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={main}
        onKeyDown={handleKeyDown}
        className="inset-0 z-50 overflow-visible md:inset-0 md:w-auto md:translate-none"
      >
        <div className="fixed inset-0 flex flex-col bg-black text-white">
          <div className="flex h-14 shrink-0 items-center gap-4 border-b border-white/10 px-5">
            <DialogTitle className="sr-only">
              Presenter view · {deck.title}
            </DialogTitle>
            <p
              aria-hidden="true"
              className="min-w-0 flex-1 truncate text-sm font-semibold text-white/75"
            >
              Presenter view · {deck.title}
            </p>
            <p
              aria-hidden="true"
              className="hidden items-center gap-1 text-xs whitespace-nowrap text-white/70 lg:flex"
            >
              <Kbd>←</Kbd> <Kbd>→</Kbd> move · <Kbd>Esc</Kbd> exits
            </p>
            <div role="group" aria-label="Timer" className="flex items-center">
              <span
                role="timer"
                aria-label="Elapsed time"
                data-paused={running ? undefined : ""}
                className="min-w-16 text-right text-xl font-bold tabular-nums data-paused:text-white/60"
              >
                {formatElapsed(elapsed)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={running ? "Pause timer" : "Resume timer"}
                // oxlint-disable-next-line shadcn/no-restyle -- round light-on-black control of present mode (7.5)
                className="rounded-full text-white hover:bg-white/15 hover:text-white"
                onClick={() => setRunning(!running)}
              >
                {running ? <Pause aria-hidden /> : <Play aria-hidden />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Reset timer"
                // oxlint-disable-next-line shadcn/no-restyle -- round light-on-black control of present mode (7.5)
                className="rounded-full text-white hover:bg-white/15 hover:text-white"
                onClick={() => setElapsed(0)}
              >
                <RotateCcw aria-hidden />
              </Button>
            </div>
            <span
              role="status"
              className="flex items-center gap-1.5 text-xs whitespace-nowrap text-white/75"
            >
              {audience === "unheard" ? null : (
                <>
                  <span
                    aria-hidden="true"
                    data-closed={audience === "closed" ? "" : undefined}
                    className="size-2 rounded-full bg-success data-closed:bg-white/40"
                  />
                  {audience === "follows"
                    ? "Audience window follows"
                    : "Audience window closed"}
                </>
              )}
            </span>
          </div>
          {/* Variant A: the slide about 62 percent on the left; stacked below 768 px for review. */}
          <div
            ref={main}
            tabIndex={-1}
            className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-4 outline-none md:grid-cols-8 md:overflow-hidden"
          >
            <Panel label="Now showing" className="max-md:h-56 md:col-span-5">
              {/* The slide takes the largest 16:9 box of the cell. */}
              <div
                ref={setStage}
                className="flex min-h-0 flex-1 items-center justify-center"
              >
                {slide === undefined || width === 0 ? null : (
                  <div className="w-(--present-slide-width)" style={widthStyle}>
                    {canvas(slide)}
                  </div>
                )}
              </div>
            </Panel>
            <div className="flex min-h-0 flex-col gap-4 md:col-span-3">
              <Panel
                label="Next"
                aside={next === undefined ? undefined : `Slide ${index + 2}`}
                className="shrink-0"
              >
                {next === undefined ? (
                  <p className="grid aspect-video place-items-center rounded-lg border border-dashed border-white/30 p-4 text-center text-sm text-white/80">
                    <span>
                      <strong className="block text-base text-white">
                        This is the last slide.
                      </strong>{" "}
                      Exit returns to the deck.
                    </span>
                  </p>
                ) : (
                  canvas(next)
                )}
              </Panel>
              <Panel
                label="Notes"
                aside={`Slide ${index + 1}`}
                className="flex-1 max-md:min-h-64"
              >
                {notes === undefined || notes.length === 0 ? (
                  <p className="grid flex-1 place-items-center rounded-xl border border-white/15 bg-white/5 text-sm text-white/75">
                    No notes for this slide.
                  </p>
                ) : (
                  // A scrolling region takes focus, so the keyboard scrolls it too.
                  <div
                    role="region"
                    aria-label={`Notes for slide ${index + 1}`}
                    tabIndex={0}
                    data-presenter-notes=""
                    className="min-h-0 flex-1 space-y-3 overflow-auto rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-lg leading-relaxed text-white"
                  >
                    {notes.map((line, number) => (
                      // Lines repeat and never move, so the position is the key.
                      // oxlint-disable-next-line react/no-array-index-key
                      <p key={number}>{line}</p>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
          <div className="flex justify-center p-4">
            <div
              role="toolbar"
              aria-label="Presentation"
              className="flex items-center gap-0.5 rounded-full bg-white/10 p-1"
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
