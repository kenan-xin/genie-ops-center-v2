"use client";

import { PageHeader } from "@genie/core/features/shell";
import { Button, EmptyState } from "@genie/ui";
import { useState } from "react";

import { PresentMode } from "./present-mode.tsx";
import { SlideCanvas } from "./slide-canvas.tsx";
import { figuresDate } from "./slide-layout.ts";
import { useDeck } from "./use-deck.ts";
import type { DeckPageView, ShownSlide } from "./views.ts";

export type DeckViewProps = {
  readonly view: DeckPageView;
};

function titleOf(slide: ShownSlide): string {
  const title = slide.elements.find((element) => element.kind === "title");

  return title !== undefined && "text" in title ? title.text : "Slide";
}

/** One deck: its header, its slide rail and the shown slide (R-52). */
export function DeckView(props: DeckViewProps) {
  const { view } = props;
  const deckQuery = useDeck(view.deck);
  const deck = deckQuery.data ?? view.deck;
  const [shown, setShown] = useState(0);
  const [presenting, setPresenting] = useState(false);

  // A refetch may remove slides, so the shown index never points past the last one.
  const index = Math.min(shown, Math.max(deck.slides.length - 1, 0));
  const current = deck.slides[index];

  return (
    <main>
      <PageHeader title={deck.title} />
      {/* Below lg the header has no room and the scaled slide footer is tiny, so the date is its
          own readable line at every width (round 1 ruling). */}
      <p data-figures-date="" className="mb-4 text-sm text-muted-foreground">
        Figures as of {figuresDate(deck.figuresAsOf)}
      </p>
      {/* The page's actions go here; wrapping keeps them from ever scrolling sideways. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={current === undefined}
          onClick={() => setPresenting(true)}
        >
          Present
        </Button>
      </div>
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
            className="flex flex-wrap gap-2 md:w-56 md:shrink-0 md:flex-col"
          >
            {deck.slides.map((slide, slideIndex) => (
              <Button
                key={slide.id}
                variant={slideIndex === index ? "secondary" : "ghost"}
                size="sm"
                aria-label={`Slide ${slideIndex + 1}: ${titleOf(slide)}`}
                aria-current={slideIndex === index}
                className="justify-start"
                onClick={() => setShown(slideIndex)}
              >
                <span className="tabular-nums">{slideIndex + 1}</span>
                <span className="max-md:sr-only truncate">
                  {titleOf(slide)}
                </span>
              </Button>
            ))}
          </nav>
          <div className="min-w-0 flex-1">
            <SlideCanvas
              slide={current}
              figuresAsOf={deck.figuresAsOf}
              timeZone={view.timeZone}
              theme={view.theme}
              logoUrl={view.logoUrl}
              imageUrls={view.imageUrls}
            />
          </div>
        </div>
      )}
      <PresentMode
        view={{ ...view, deck }}
        startAt={index}
        open={presenting}
        onOpenChange={setPresenting}
      />
    </main>
  );
}
