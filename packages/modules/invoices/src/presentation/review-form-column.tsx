"use client";

import { Button, FieldLabel, FieldTitle } from "@genie/ui";
import { LocateFixedIcon } from "lucide-react";
import { useId, type ReactNode } from "react";

import type { MarkPlace } from "./document-viewer.tsx";
import { OriginTag } from "./review-fields.tsx";
import type { ReviewFrame, ReviewItem, ReviewModel } from "./review-model.ts";
import {
  type ReviewSection,
  SECTION_TITLES,
  sectionOf,
  sectionsOf,
} from "./review-sections.ts";

/** The ring border of a lit control, selected or under the pointer, both ways (prototype l.64). */
const LIT_CONTROL =
  "data-selected:**:data-[slot=input]:border-ring data-selected:**:data-[slot=input-group]:border-ring data-selected:**:data-[slot=select-trigger]:border-ring data-selected:**:data-[slot=combobox-input]:border-ring data-hovered:**:data-[slot=input]:border-ring data-hovered:**:data-[slot=input-group]:border-ring data-hovered:**:data-[slot=select-trigger]:border-ring data-hovered:**:data-[slot=combobox-input]:border-ring";

/**
 * One field of the form: its label, a chip only when it needs attention (H1-27), its control or
 * its value as text with its locate button, the value read with Undo once the person changed it,
 * and its note.
 */
function ReviewField(props: {
  readonly item: ReviewItem;
  readonly selected: boolean;
  readonly hovered: string | null;
  readonly onSelect: (key: string) => void;
  /** A locate press: selects the field; on a phone also brings the lens into view. */
  readonly onLocate: (key: string) => void;
  readonly onHover: (key: string | null) => void;
  /** The places of the marks once the page drew; null before. */
  readonly places: readonly MarkPlace[] | null;
  /** False while the page failed: no locate buttons. */
  readonly locate: boolean;
}): ReactNode {
  const { item } = props;

  // A quoted field whose quote the page does not hold has no line to light.
  const missingLine =
    item.sources.length > 0 &&
    props.places !== null &&
    !props.places.some((place) => place.key === item.key);

  return (
    <div
      data-field={item.key}
      data-selected={props.selected ? "" : undefined}
      data-hovered={props.hovered === item.key ? "" : undefined}
      className={`flex flex-col gap-1.5 ${LIT_CONTROL}`}
      // Focus inside a field selects it, so its line is boxed on the page (czjw.98).
      onFocus={() => props.onSelect(item.key)}
      // The pointer lights the field's line on the page, as the line lights the field (T2-b).
      onPointerEnter={() => props.onHover(item.key)}
      onPointerLeave={() => props.onHover(null)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {item.controlId === null ? (
          <FieldTitle>{item.label}</FieldTitle>
        ) : (
          <FieldLabel htmlFor={item.controlId}>{item.label}</FieldLabel>
        )}
        {item.tag === "needs-input" || item.tag === "check-this" ? (
          <OriginTag tag={item.tag} />
        ) : sectionOf(item) === "optional" ? (
          <span className="text-xs text-muted-foreground">Optional</span>
        ) : null}
      </div>
      {item.sources.length > 0 ? (
        <div className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            {item.control ?? (
              <p className="text-sm break-words">{item.display}</p>
            )}
          </div>
          {props.locate && !missingLine ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-dense"
              aria-label={`Show ${item.label} on the document`}
              title="Show on the document"
              aria-pressed={props.selected}
              onClick={() => props.onLocate(item.key)}
            >
              <LocateFixedIcon aria-hidden strokeWidth={1.75} />
            </Button>
          ) : null}
        </div>
      ) : (
        (item.control ?? <p className="text-sm break-words">{item.display}</p>)
      )}
      {missingLine ? (
        <p className="text-xs text-muted-foreground">
          No matching line was found on the page.
        </p>
      ) : null}
      {item.readAs === null ? null : (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="min-w-0 break-words">Read as “{item.readAs}”</span>
          {item.onUndo === null ? null : (
            <Button
              type="button"
              variant="link"
              size="sm"
              aria-label={`Undo ${item.label}`}
              onClick={item.onUndo}
            >
              Undo
            </Button>
          )}
        </p>
      )}
      {item.note === null ? null : (
        <p className="text-xs text-muted-foreground">{item.note}</p>
      )}
    </div>
  );
}

const SECTIONS: readonly ReviewSection[] = ["needs", "read", "optional"];

/**
 * The one form of a review (czjw.187): the saved result, the Could not read card, Type, then the
 * fields in the sections the reading gives them, the split of a payment and its notices.
 */
export function ReviewFormColumn(props: {
  readonly frame: ReviewFrame;
  readonly model: ReviewModel | null;
  /** While the job reads or the sweep plays, the reading note stands in for the fields (P09-2). */
  readonly reading: boolean;
  readonly selected: string | null;
  readonly onSelect: (key: string) => void;
  /** A locate press: selects the field; on a phone also brings the lens into view. */
  readonly onLocate: (key: string) => void;
  readonly hovered: string | null;
  readonly onHover: (key: string | null) => void;
  /** The places of the marks once the page drew; null before. */
  readonly places: readonly MarkPlace[] | null;
  /** False while the page failed: no locate buttons. */
  readonly locate: boolean;
}): ReactNode {
  const { frame, model } = props;
  const id = useId();
  const sections = sectionsOf(model?.items ?? []);

  return (
    <div className="flex flex-col gap-5">
      {frame.saved}
      {frame.notice}
      {frame.typeSelect}
      {props.reading ? (
        <p className="text-sm text-muted-foreground">
          Reading the document. The fields show here when the reading finishes.
        </p>
      ) : (
        <>
          {SECTIONS.map((section) =>
            sections[section].length === 0 ? null : (
              <section
                key={section}
                aria-labelledby={`${id}-${section}`}
                className="flex flex-col gap-2.5"
              >
                <h2
                  id={`${id}-${section}`}
                  className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {SECTION_TITLES[section]}
                </h2>
                <div className="flex flex-col gap-4">
                  {sections[section].map((item) => (
                    <ReviewField
                      key={item.key}
                      item={item}
                      selected={props.selected === item.key}
                      hovered={props.hovered}
                      onSelect={props.onSelect}
                      onLocate={props.onLocate}
                      onHover={props.onHover}
                      places={props.places}
                      locate={props.locate}
                    />
                  ))}
                </div>
              </section>
            )
          )}
          {model?.split == null ? null : (
            <div data-review-split="">{model.split}</div>
          )}
          {model?.consequence == null ? null : (
            <p
              data-review-consequence=""
              aria-live="polite"
              className="text-sm"
            >
              {model.consequence}
            </p>
          )}
        </>
      )}
      {model?.notices}
    </div>
  );
}
