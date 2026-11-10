"use client";

import { contrastRatio } from "@genie/core/features/branding";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FieldDescription,
  FieldError,
  Input,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  ToggleGroup,
  ToggleGroupItem,
} from "@genie/ui";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  MinusIcon,
  MoveIcon,
  PaintBucketIcon,
  PencilIcon,
  PlusIcon,
  SquareIcon,
  TypeIcon,
} from "lucide-react";
import { type ReactNode, useId, useState, useSyncExternalStore } from "react";

import {
  BORDER_WIDTHS,
  type DeckChange,
  type ElementBox,
  type ElementKind,
  FONT_SIZES,
  FONT_WEIGHTS,
  hexColor,
  slideRuleIssues,
  type StyleChange,
  TEXT_KINDS,
  THEME_BACKGROUND,
  THEME_TEXT,
} from "../contract.ts";
import { boxStep, movedBox, resizedBox, SNAP } from "./canvas-adapter.ts";
import type { ShownElement, ShownSlide } from "./views.ts";

/** The swatches of the prototype; any other color goes through the hex field. */
const SWATCHES = [
  ["Ink", "#111827"],
  ["Slate", "#4B5563"],
  ["White", "#FFFFFF"],
  ["Light gray", "#F3F4F6"],
  ["Blue", "#2563EB"],
  ["Dark blue", "#1E3A8A"],
  ["Pale blue", "#EFF6FF"],
  ["Green", "#047857"],
  ["Brown", "#9A3412"],
] as const;

const WEIGHT_LABEL = {
  regular: "Regular",
  semibold: "Semibold",
  bold: "Bold",
} as const;

const PHONE_QUERY = "(max-width: 767px)";

/** True below 768 px, where Position opens a bottom sheet instead of a popover. */
function useIsPhone(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(PHONE_QUERY);

      query.addEventListener("change", notify);

      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  );
}

/** Swatches, a hex field and a clear choice; a pick or a valid hex calls `onPick` once. */
export function ColorChoice(props: {
  readonly label: string;
  readonly value: string | undefined;
  readonly clearLabel: string;
  readonly helper?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly icon: ReactNode;
  readonly onPick: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hexId = useId();
  const helpId = useId();
  const errorId = useId();

  function pick(color: string | null): void {
    setOpen(false);
    props.onPick(color);
  }

  function applyHex(): void {
    const parsed = hexColor.safeParse(hex.trim());

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a 6-digit hex color.");

      return;
    }

    setError(null);
    pick(parsed.data.toUpperCase());
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={props.disabled}
        render={<Button variant="ghost" size="sm" />}
        aria-label={
          props.value === undefined
            ? props.label
            : `${props.label}, ${props.value}`
        }
      >
        {props.icon}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="grid gap-3">
          <PopoverTitle>{props.label}</PopoverTitle>
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map(([name, color]) => (
              <button
                key={color}
                type="button"
                aria-label={`${name} ${color}`}
                aria-pressed={props.value?.toUpperCase() === color}
                className="size-8 rounded-md border border-border bg-(--swatch) aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-1"
                style={
                  // SAFETY: CSS custom properties are not in React's style type; this object holds only them.
                  { "--swatch": color } as React.CSSProperties
                }
                onClick={() => pick(color)}
              />
            ))}
          </div>
          <div className="grid gap-1">
            <label htmlFor={hexId} className="text-sm font-medium">
              Hex
            </label>
            <div className="flex gap-2">
              <Input
                id={hexId}
                value={hex}
                placeholder="#1E3A8A"
                aria-invalid={error === null ? undefined : true}
                aria-describedby={
                  error === null ? helpId : `${helpId} ${errorId}`
                }
                onValueChange={setHex}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyHex();
                }}
              />
              <Button variant="secondary" onClick={applyHex}>
                Apply
              </Button>
            </div>
            <FieldDescription id={helpId}>
              {props.helper ?? "Or type a 6-digit hex color."}
            </FieldDescription>
            {error === null ? null : (
              <FieldError id={errorId}>{error}</FieldError>
            )}
          </div>
          <Button variant="ghost" onClick={() => pick(null)}>
            {props.clearLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The nudge pad and the width and height steppers; each press is one step (WCAG 2.2 SC 2.5.7). */
export function PositionControl(props: {
  readonly box: ElementBox;
  readonly kind: ElementKind;
  readonly disabled?: boolean | undefined;
  readonly onBox: (box: ElementBox) => void;
}) {
  const { box, kind } = props;

  const move = (x: number, y: number) =>
    props.onBox(movedBox(box, { x, y }, kind));

  const size = (w: number, h: number) =>
    props.onBox(resizedBox(box, { w, h }, kind));

  const pad = (label: string, icon: ReactNode, onClick: () => void) => (
    <Button
      variant="secondary"
      size="icon"
      aria-label={label}
      disabled={props.disabled}
      onClick={onClick}
    >
      {icon}
    </Button>
  );

  const stepper = (
    label: string,
    value: number,
    onLess: () => void,
    onMore: () => void
  ) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          aria-label={`Less ${label.toLowerCase()}`}
          disabled={props.disabled}
          onClick={onLess}
        >
          <MinusIcon aria-hidden="true" />
        </Button>
        <span
          className="w-10 text-center font-semibold tabular-nums"
          aria-live="polite"
        >
          {value}
        </span>
        <Button
          variant="secondary"
          size="icon"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={props.disabled}
          onClick={onMore}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <span className="text-sm font-semibold">Move, {SNAP} per tap</span>
        <div className="grid w-fit grid-cols-3 gap-1">
          <div className="col-start-2">
            {pad("Move up", <ArrowUpIcon aria-hidden="true" />, () =>
              move(0, -SNAP)
            )}
          </div>
          <div className="col-start-1 row-start-2">
            {pad("Move left", <ArrowLeftIcon aria-hidden="true" />, () =>
              move(-SNAP, 0)
            )}
          </div>
          <div className="col-start-3 row-start-2">
            {pad("Move right", <ArrowRightIcon aria-hidden="true" />, () =>
              move(SNAP, 0)
            )}
          </div>
          <div className="col-start-2 row-start-3">
            {pad("Move down", <ArrowDownIcon aria-hidden="true" />, () =>
              move(0, SNAP)
            )}
          </div>
        </div>
      </div>
      <div className="grid content-start gap-2">
        <span className="text-sm font-semibold">Size, {SNAP} per tap</span>
        {stepper(
          "Width",
          box.w,
          () => size(-SNAP, 0),
          () => size(SNAP, 0)
        )}
        {stepper(
          "Height",
          box.h,
          () => size(0, -SNAP),
          () => size(0, SNAP)
        )}
      </div>
    </div>
  );
}

export type StyleToolbarProps = {
  readonly element: ShownElement;
  readonly slideId: string;
  readonly index: number;
  /** The element's box as drawn: its own, else the computed one. */
  readonly box: ElementBox;
  /** The slide's background, which a fill pick checks the text color against. */
  readonly background?: string | undefined;
  readonly saving?: boolean;
  readonly onStep: (step: DeckChange) => void;
  readonly onEditText: () => void;
};

/**
 * The style controls of the selected element (variant A, S7-43). A title, text or bullet list
 * takes color, size, weight, alignment, fill and border; a figure, chart, table or image only
 * fill and border. Each control sends one `change-element` step. Below 768 px it docks at the
 * bottom of the screen in two rows.
 */
export function StyleToolbar(props: StyleToolbarProps) {
  const { element, slideId, index, saving } = props;
  const style = element.style ?? {};
  const text = TEXT_KINDS.has(element.kind);
  const phone = useIsPhone();
  const [positionOpen, setPositionOpen] = useState(false);

  const send = (change: StyleChange | null) =>
    props.onStep({ op: "change-element", slideId, index, style: change });

  const position = (
    <PositionControl
      box={props.box}
      kind={element.kind}
      disabled={saving}
      onBox={(box) => props.onStep(boxStep(slideId, index, box))}
    />
  );

  const positionLabel = (
    <>
      <MoveIcon aria-hidden="true" /> Position
    </>
  );

  return (
    <div
      role="toolbar"
      aria-label={`${element.kind === "title" ? "Title" : element.kind[0]?.toUpperCase() + element.kind.slice(1)} style`}
      className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center gap-1 border-t border-border bg-background p-2 shadow-lg md:static md:z-auto md:w-fit md:rounded-lg md:border md:shadow-sm"
    >
      {text ? (
        <>
          <ColorChoice
            label="Text color"
            value={style.color}
            clearLabel="Use the theme color"
            disabled={saving}
            icon={<TypeIcon aria-hidden="true" />}
            onPick={(color) => send({ color })}
          />
          <Select
            items={FONT_SIZES.map((size) => ({
              value: String(size),
              label: String(size),
            }))}
            value={style.fontSize === undefined ? null : String(style.fontSize)}
            disabled={saving}
            onValueChange={(value) =>
              send({
                fontSize:
                  value === null
                    ? null
                    : (FONT_SIZES.find((size) => String(size) === value) ??
                      null),
              })
            }
          >
            <SelectTrigger aria-label="Font size" className="w-20">
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent>
              {FONT_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={FONT_WEIGHTS.map((weight) => ({
              value: weight,
              label: WEIGHT_LABEL[weight],
            }))}
            value={style.weight ?? null}
            disabled={saving}
            onValueChange={(value) =>
              send({
                weight: FONT_WEIGHTS.find((weight) => weight === value) ?? null,
              })
            }
          >
            <SelectTrigger aria-label="Weight" className="w-32">
              <SelectValue placeholder="Weight" />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHTS.map((weight) => (
                <SelectItem key={weight} value={weight}>
                  {WEIGHT_LABEL[weight]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup
            aria-label="Alignment"
            value={style.align === undefined ? [] : [style.align]}
            disabled={saving}
            onValueChange={(value) => {
              const align = value[0];

              send({
                align:
                  align === "left" || align === "center" || align === "right"
                    ? align
                    : null,
              });
            }}
          >
            <ToggleGroupItem value="left" aria-label="Align left">
              <AlignLeftIcon aria-hidden="true" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" aria-label="Align center">
              <AlignCenterIcon aria-hidden="true" />
            </ToggleGroupItem>
            <ToggleGroupItem value="right" aria-label="Align right">
              <AlignRightIcon aria-hidden="true" />
            </ToggleGroupItem>
          </ToggleGroup>
        </>
      ) : null}
      <ColorChoice
        label="Fill"
        value={style.fill}
        clearLabel="No fill"
        disabled={saving}
        icon={<PaintBucketIcon aria-hidden="true" />}
        onPick={(fill) => send(fillChange(element, props.background, fill))}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={saving}
          render={<Button variant="ghost" size="sm" />}
          aria-label={`Border, ${style.border?.width ?? 0} pixels`}
        >
          <SquareIcon aria-hidden="true" /> {style.border?.width ?? 0}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {BORDER_WIDTHS.map((width) => (
            <DropdownMenuItem
              key={width}
              onClick={() =>
                send({
                  border:
                    width === 0
                      ? null
                      : { color: style.border?.color ?? "#111827", width },
                })
              }
            >
              {width === 0 ? "No border" : `Border ${width} pixels`}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {phone ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => setPositionOpen(true)}
          >
            {positionLabel}
          </Button>
          <Sheet open={positionOpen} onOpenChange={setPositionOpen}>
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>Position and size</SheetTitle>
              </SheetHeader>
              <div className="p-4">{position}</div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Popover>
          <PopoverTrigger
            disabled={saving}
            render={<Button variant="ghost" size="sm" />}
          >
            {positionLabel}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto">
            <PopoverTitle>Position and size</PopoverTitle>
            {position}
          </PopoverContent>
        </Popover>
      )}
      {text ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={props.onEditText}
        >
          <PencilIcon aria-hidden="true" /> Edit text
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        disabled={saving || element.style === undefined}
        onClick={() => send(null)}
      >
        Use theme style
      </Button>
    </div>
  );
}

/**
 * The color a text needs on what draws behind it, or `undefined` when its own color reaches the
 * flat 4.5:1 (P13-9, P16-4). On the theme background the theme's own text color (`null`); else
 * the theme text or white, whichever has more contrast there.
 */
function readableColor(
  color: string | undefined,
  fill: string | undefined,
  background: string | undefined
): string | null | undefined {
  const behind = fill ?? background ?? THEME_BACKGROUND;

  if (contrastRatio(color ?? THEME_TEXT, behind) >= 4.5) return undefined;

  if (fill === undefined && background === undefined) return null;

  return contrastRatio(THEME_TEXT, behind) >= contrastRatio("#FFFFFF", behind)
    ? THEME_TEXT
    : "#FFFFFF";
}

/**
 * A fill pick with the text color it needs: a title, text or bullet list whose color falls below
 * 4.5:1 on what then draws behind it takes a readable color in the same step (P13-9).
 */
export function fillChange(
  element: ShownElement,
  background: string | undefined,
  fill: string | null
): StyleChange {
  if (!TEXT_KINDS.has(element.kind)) return { fill };

  const color = readableColor(
    element.style?.color,
    fill ?? undefined,
    background
  );

  return color === undefined ? { fill } : { fill, color };
}

/**
 * A background change with the text colors it needs: each text without a fill whose color falls
 * below 4.5:1 on the new background takes a readable color in the same change, so a hand edit reaches
 * what the save allows (P13-9). One change, one Undo entry.
 */
export function backgroundSteps(
  slide: ShownSlide,
  background: string | null
): DeckChange[] {
  const texts = slide.elements.flatMap((element, index) => {
    // A text with its own fill draws on that fill, which a background change leaves as it is.
    if (!TEXT_KINDS.has(element.kind) || element.style?.fill !== undefined) {
      return [];
    }

    const color = readableColor(
      element.style?.color,
      undefined,
      background ?? undefined
    );

    return color === undefined
      ? []
      : [
          {
            op: "change-element" as const,
            slideId: slide.id,
            index,
            style: { color },
          },
        ];
  });

  return [
    { op: "change-slide-fields", slideId: slide.id, background },
    ...texts,
  ];
}

/** The kinds a hand edit adds without a chart config (P13-5). */
const ADDABLE = [
  ["text", "Text"],
  ["bullets", "Bullets"],
  ["image", "Image"],
] as const;

/** Add element and Background, above the slide (variant A). */
export function SlideEditorBar(props: {
  readonly slide: ShownSlide;
  readonly saving?: boolean;
  readonly onSteps: (steps: readonly DeckChange[]) => void;
  /** A text or bullet list goes in at once; an image needs its file and alt text in the editor. */
  readonly onAdd: (kind: "text" | "bullets" | "image") => void;
}) {
  const { slide } = props;
  const kinds = slide.elements.map(({ kind }) => kind);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={props.saving}
          render={<Button variant="secondary" />}
        >
          <PlusIcon aria-hidden="true" /> Add element
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {ADDABLE.map(([kind, label]) => (
            <DropdownMenuItem
              key={kind}
              // A kind the slide rules refuse here is offered disabled, never refused after.
              disabled={slideRuleIssues([...kinds, kind]).length > 0}
              onClick={() => props.onAdd(kind)}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ColorChoice
        label="Background"
        value={slide.background}
        clearLabel="No background"
        helper="Every text without a fill is checked against the new color."
        disabled={props.saving}
        icon={
          <>
            <PaintBucketIcon aria-hidden="true" /> Background
          </>
        }
        onPick={(background) =>
          props.onSteps(backgroundSteps(slide, background))
        }
      />
    </div>
  );
}
