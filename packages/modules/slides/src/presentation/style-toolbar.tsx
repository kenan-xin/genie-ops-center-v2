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
  ToggleGroup,
  iconLeadPx,
  minTouchHeight,
  ToggleGroupItem,
  ToolbarButton,
  touchAreas,
} from "@genie/ui";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  EllipsisIcon,
  MinusIcon,
  MoveIcon,
  PaintBucketIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SquareIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";

import {
  BORDER_WIDTHS,
  type DeckChange,
  type ElementBox,
  type ElementKind,
  FONT_SIZES,
  FONT_WEIGHTS,
  hexColor,
  type StyleChange,
  type SlideTheme,
  TEXT_KINDS,
} from "../contract.ts";
import {
  AddElementMenu,
  type AskKind,
  type HandKind,
} from "./add-element-menu.tsx";
import { boxStep, movedBox, resizedBox, SNAP } from "./canvas-adapter.ts";
import { DockSheet, DockSheetRow } from "./dock-sheet.tsx";
import { PhoneDock } from "./phone-dock.tsx";
import { contrastLimit, textGround } from "./slide-layout.ts";
import { useIsPhone } from "./use-is-phone.ts";
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

/** Swatches, a hex field and a clear choice; a pick or a valid hex calls `onPick` once. */
export function ColorPanel(props: {
  readonly value: string | undefined;
  readonly clearLabel: string;
  readonly helper?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly onPick: (color: string | null) => void;
}) {
  const [hex, setHex] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hexId = useId();
  const helpId = useId();
  const errorId = useId();

  function applyHex(): void {
    const parsed = hexColor.safeParse(hex.trim());

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a 6-digit hex color.");

      return;
    }

    setError(null);
    props.onPick(parsed.data.toUpperCase());
  }

  return (
    <>
      <div className="flex flex-wrap gap-1 lg:gap-1.5">
        {SWATCHES.map(([name, color]) => (
          <button
            key={color}
            type="button"
            aria-label={`${name} ${color}`}
            aria-pressed={props.value?.toUpperCase() === color}
            disabled={props.disabled}
            // C13-3: a phone control's 40 px and its 44 px touch area under lg; 32 px from lg.
            className={`size-10 lg:size-8 ${touchAreas.md} rounded-md border border-border bg-(--swatch) disabled:opacity-50 aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-1`}
            style={
              // SAFETY: CSS custom properties are not in React's style type; this object holds only them.
              { "--swatch": color } as React.CSSProperties
            }
            onClick={() => props.onPick(color)}
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
            aria-describedby={error === null ? helpId : `${helpId} ${errorId}`}
            onValueChange={setHex}
            onKeyDown={(event) => {
              // The card stays open through a save, so Enter waits for it as Apply does.
              if (event.key === "Enter" && props.disabled !== true) applyHex();
            }}
          />
          <Button
            variant="secondary"
            disabled={props.disabled}
            onClick={applyHex}
          >
            Apply
          </Button>
        </div>
        <FieldDescription id={helpId}>
          {props.helper ?? "Or type a 6-digit hex color."}
        </FieldDescription>
        {error === null ? null : <FieldError id={errorId}>{error}</FieldError>}
      </div>
      <Button
        variant="ghost"
        disabled={props.disabled}
        onClick={() => props.onPick(null)}
      >
        {props.clearLabel}
      </Button>
    </>
  );
}

/** The desktop popover around `ColorPanel`; a pick closes it. */
export function ColorChoice(props: {
  readonly label: string;
  readonly value: string | undefined;
  readonly clearLabel: string;
  readonly helper?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly icon: ReactNode;
  /** sm in a toolbar (dense); md beside md controls outside one. */
  readonly size?: "sm" | "md" | undefined;
  readonly onPick: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={props.disabled}
        render={<Button variant="ghost" size={props.size ?? "sm"} />}
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
          <ColorPanel
            value={props.value}
            clearLabel={props.clearLabel}
            helper={props.helper}
            onPick={(color) => {
              setOpen(false);
              props.onPick(color);
            }}
          />
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

/** The selected element's name in the phone dock and its More sheet (P13-17). */
const ELEMENT_NAMES: Record<ElementKind, string> = {
  title: "Title",
  text: "Text box",
  bullets: "Bullet list",
  figure: "Figure",
  chart: "Chart",
  table: "Table",
  image: "Image",
};

/** The state that refuses Use theme style: the element already takes the theme (6wz1.126). */
const THEMED = "Already uses the theme style.";

export type StyleToolbarProps = {
  readonly element: ShownElement;
  readonly slideId: string;
  readonly index: number;
  /** The element's box as drawn: its own, else the computed one. */
  readonly box: ElementBox;
  /** The slide, its theme and whether it is first: a fill pick checks the text on what then draws behind it. */
  readonly slide: ShownSlide;
  readonly theme: SlideTheme;
  readonly first: boolean;
  readonly saving?: boolean;
  readonly onStep: (step: DeckChange) => void;
  readonly onEditText: () => void;
  /** Leaves the element: the phone dock's Done. */
  readonly onDone: () => void;
  /** Removes the element; undefined when the slide rules refuse the slide without it. Phone only. */
  readonly onDelete?: (() => void) | undefined;
  /** The slide rule that refuses Delete element, shown as its reason (6wz1.126). Phone only. */
  readonly deleteRefusal?: string | undefined;
};

/**
 * The style controls of the selected element (variant A, S7-43). A title, text or bullet list
 * takes color, size, weight, alignment, fill and border; a figure, chart, table or image only
 * fill and border. Each control sends one `change-element` step. Below 768 px it is a dock of
 * one row of tools at the bottom of the screen, each opening a card above it (czjw.156, P16e-7).
 */
export function StyleToolbar(props: StyleToolbarProps) {
  const { element, slideId, index, saving } = props;
  const style = element.style ?? {};
  const text = TEXT_KINDS.has(element.kind);
  const phone = useIsPhone();
  const dock = useRef<HTMLDivElement>(null);
  // The open card of the dock: one at a time.
  const [tool, setTool] = useState<string | null>(null);
  // The phone More sheet, as the page's (P13-18): focus return off for an action that moves focus
  // itself, and an action that must wait for the sheet to leave runs once it has.
  const [more, setMore] = useState(false);
  const moreFocus = useRef(true);
  const afterMore = useRef<(() => void) | null>(null);
  const themed = element.style === undefined;
  const themedId = useId();

  const label = `${element.kind === "title" ? "Title" : element.kind[0]?.toUpperCase() + element.kind.slice(1)} style`;

  const send = (change: StyleChange | null) =>
    props.onStep({ op: "change-element", slideId, index, style: change });

  const border = (width: (typeof BORDER_WIDTHS)[number]) =>
    send({
      border:
        width === 0 ? null : { color: style.border?.color ?? "#111827", width },
    });

  const position = (
    <PositionControl
      box={props.box}
      kind={element.kind}
      disabled={saving}
      onBox={(box) => props.onStep(boxStep(slideId, index, box))}
    />
  );

  const textControls = (
    <>
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
                : (FONT_SIZES.find((size) => String(size) === value) ?? null),
          })
        }
      >
        {/* C06-1: a toolbar is a dense place, so the selects take the 32 px of its buttons and chips. */}
        <SelectTrigger aria-label="Font size" size="sm" className="w-20">
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
        <SelectTrigger aria-label="Weight" size="sm" className="w-32">
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
  );

  const fillPick = (fill: string | null) =>
    send(fillChange(props.slide, index, props.theme, props.first, fill));

  if (phone) {
    const elementName = ELEMENT_NAMES[element.kind];

    const closeMore = (returnFocus: boolean, after?: () => void) => {
      moreFocus.current = returnFocus;
      afterMore.current = after ?? null;
      setMore(false);
    };

    const tools: (readonly [string, ReactNode, ReactNode])[] = [
      ...(text
        ? [
            [
              "Text",
              <TypeIcon aria-hidden="true" />,
              <>
                <span className="text-sm font-semibold">Text color</span>
                <ColorPanel
                  value={style.color}
                  clearLabel="Use the theme color"
                  disabled={saving}
                  onPick={(color) => send({ color })}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {textControls}
                </div>
              </>,
            ] as const,
          ]
        : []),
      [
        "Fill",
        <PaintBucketIcon aria-hidden="true" />,
        <ColorPanel
          value={style.fill}
          clearLabel="No fill"
          disabled={saving}
          onPick={fillPick}
        />,
      ],
      [
        "Border",
        <SquareIcon aria-hidden="true" />,
        <ToggleGroup
          aria-label="Border width"
          value={[String(style.border?.width ?? 0)]}
          disabled={saving}
          onValueChange={(value) => {
            const width = BORDER_WIDTHS.find((w) => String(w) === value[0]);

            // A press on the pressed value leaves none; the border stays as it is.
            if (width !== undefined) border(width);
          }}
        >
          {BORDER_WIDTHS.map((width) => (
            <ToggleGroupItem key={width} value={String(width)}>
              {width === 0 ? "None" : `${width} px`}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>,
      ],
      ["Position", <MoveIcon aria-hidden="true" />, position],
    ];

    return (
      <>
        <PhoneDock
          ref={dock}
          label={label}
          context={
            // C13-2: 44 px keeps Done's touch area inside its row, clear of the tools.
            <div
              className={`flex ${minTouchHeight} items-center justify-between ps-4 pe-2 text-sm text-muted-foreground`}
            >
              <span>{elementName}</span>
              <Button variant="ghost-primary" size="sm" onClick={props.onDone}>
                Done
              </Button>
            </div>
          }
        >
          {tools.map(([name, icon, card]) => (
            <Popover
              key={name}
              open={tool === name}
              onOpenChange={(open) => setTool(open ? name : null)}
            >
              <PopoverTrigger render={<ToolbarButton />}>
                {icon}
                {name}
              </PopoverTrigger>
              <PopoverContent
                anchor={dock}
                side="top"
                sideOffset={8}
                className="w-(--anchor-width) max-w-(--available-width)"
              >
                <div className="grid gap-3 p-1.5">
                  <PopoverTitle>{name}</PopoverTitle>
                  {/* Review Focus 4: a short card that scrolls leaves the selected element in view. */}
                  <div className="-m-1 grid max-h-48 gap-3 overflow-y-auto p-1">
                    {card}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ))}
          <ToolbarButton
            onClick={() => {
              // A re-open during the close never runs the last open's action.
              afterMore.current = null;
              moreFocus.current = true;
              setMore(true);
            }}
          >
            <EllipsisIcon aria-hidden="true" />
            More
          </ToolbarButton>
        </PhoneDock>
        {/* Each icon's lead offset puts its ink on the heading's text edge (6wz1.113). */}
        <DockSheet
          open={more}
          onOpenChange={setMore}
          title={`${elementName} actions`}
          heading={elementName}
          returnFocus={() => moreFocus.current}
          onClosed={() => {
            afterMore.current?.();
            afterMore.current = null;
          }}
        >
          {text ? (
            <DockSheetRow
              icon={<PencilIcon aria-hidden="true" className={iconLeadPx[3]} />}
              label="Edit text"
              busy={saving}
              // The editor opens once the sheet has gone, so the two never stack.
              onClick={() => closeMore(false, props.onEditText)}
            />
          ) : null}
          <DockSheetRow
            icon={
              <RotateCcwIcon aria-hidden="true" className={iconLeadPx[3]} />
            }
            label="Use theme style"
            reason={themed ? THEMED : undefined}
            busy={saving}
            onClick={() => {
              closeMore(true);
              send(null);
            }}
          />
          <DockSheetRow
            icon={<Trash2Icon aria-hidden="true" className={iconLeadPx[4]} />}
            label="Delete element"
            danger
            reason={props.deleteRefusal}
            busy={saving || props.onDelete === undefined}
            onClick={() => {
              closeMore(true);
              props.onDelete?.();
            }}
          />
        </DockSheet>
      </>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label={label}
      className="flex w-fit flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-2 shadow-sm"
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
          {textControls}
        </>
      ) : null}
      <ColorChoice
        label="Fill"
        value={style.fill}
        clearLabel="No fill"
        disabled={saving}
        icon={<PaintBucketIcon aria-hidden="true" />}
        onPick={fillPick}
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
            <DropdownMenuItem key={width} onClick={() => border(width)}>
              {width === 0 ? "No border" : `Border ${width} pixels`}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover>
        <PopoverTrigger
          disabled={saving}
          render={<Button variant="ghost" size="sm" />}
        >
          <MoveIcon aria-hidden="true" /> Position
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto">
          <PopoverTitle>Position and size</PopoverTitle>
          {position}
        </PopoverContent>
      </Popover>
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
        disabled={saving || themed}
        focusableWhenDisabled
        aria-describedby={themed ? themedId : undefined}
        onClick={() => send(null)}
      >
        Use theme style
      </Button>
      {themed ? (
        <span id={themedId} className="text-xs text-muted-foreground">
          {THEMED}
        </span>
      ) : null}
    </div>
  );
}

type TextKind = "title" | "text" | "bullets";

const isText = (kind: ElementKind): kind is TextKind => TEXT_KINDS.has(kind);

/**
 * The color one text needs on what draws behind it, or `undefined` when its color already reaches
 * the save's limit (P13-9, P14-33). The first of its place's color, the theme text and white that
 * reaches the limit, else black; its place's color clears the text's own color (`null`).
 */
function readableColor(
  slide: Parameters<typeof textGround>[0],
  index: number,
  theme: SlideTheme,
  first: boolean
): string | null | undefined {
  const element = slide.elements[index];

  if (element === undefined || !isText(element.kind)) return undefined;

  const ground = textGround(slide, index, theme, first);
  const needs = contrastLimit(element.kind, element.style?.fontSize);

  if (contrastRatio(ground.color, ground.behind) >= needs) return undefined;

  // White or black always reaches 4.58:1, so black repairs what the others cannot (czjw.138).
  const color =
    [ground.defaultColor, theme.text, "#FFFFFF"].find(
      (candidate) => contrastRatio(candidate, ground.behind) >= needs
    ) ?? "#000000";

  return color === ground.defaultColor ? null : color;
}

/**
 * A fill pick with the text color it needs: a title, text or bullet list whose color falls below
 * its limit on the new fill takes a readable color in the same step (P13-9).
 */
export function fillChange(
  slide: ShownSlide,
  index: number,
  theme: SlideTheme,
  first: boolean,
  fill: string | null
): StyleChange {
  const color = readableColor(
    {
      ...slide,
      elements: slide.elements.map((element, at) =>
        at === index
          ? { ...element, style: { ...element.style, fill: fill ?? undefined } }
          : element
      ),
    },
    index,
    theme,
    first
  );

  return color === undefined ? { fill } : { fill, color };
}

/**
 * A background change with the text colors it needs: each text without a fill whose color falls
 * below its limit on what then draws behind it takes a readable color in the same change, so a hand
 * edit reaches what the save allows (P13-9, P14-15). One change, one Undo entry.
 */
export function backgroundSteps(
  slide: ShownSlide,
  background: string | null,
  theme: SlideTheme,
  first: boolean
): DeckChange[] {
  const next = { ...slide, background: background ?? undefined };

  const texts = slide.elements.flatMap((element, index) => {
    // A text with its own fill draws on that fill, which a background change leaves as it is.
    if (element.style?.fill !== undefined) return [];

    const color = readableColor(next, index, theme, first);

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

/** Add element and Background, above the slide (variant A). */
export function SlideEditorBar(props: {
  readonly slide: ShownSlide;
  readonly theme: SlideTheme;
  readonly first: boolean;
  readonly saving?: boolean;
  readonly onSteps: (steps: readonly DeckChange[]) => void;
  /** The person's Ask, which Figure, Chart and Table go through. */
  readonly ask: "on" | "off" | "none";
  /** A text or bullet list goes in at once; an image needs its file and alt text in the editor. */
  readonly onAdd: (kind: HandKind) => void;
  readonly onAsk: (kind: AskKind) => void;
}) {
  const { slide } = props;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AddElementMenu
        slide={slide}
        saving={props.saving}
        ask={props.ask}
        onAdd={props.onAdd}
        onAsk={props.onAsk}
        trigger={<Button variant="secondary" />}
      >
        <PlusIcon aria-hidden="true" /> Add element
      </AddElementMenu>
      <ColorChoice
        label="Background"
        size="md"
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
          props.onSteps(
            backgroundSteps(slide, background, props.theme, props.first)
          )
        }
      />
    </div>
  );
}
