export type IconAllowEntry = {
  readonly selector: string;
  readonly reason: string;
  /** The place draws no icon, only a shape the check reads as one, so it can hide no known case and a known-case story keeps it (P07-71). */
  readonly decoration?: true;
};

export type IconRelation = {
  readonly rule: "start" | "center" | "slot" | "gutter";
  readonly cause: "box" | "bearing";
  readonly offsetPx: number;
  readonly icon: string;
  readonly row: string;
  readonly reference: string;
};

export type IconMeasurement = {
  readonly units: number;
  readonly relations: readonly IconRelation[];
};

export { ICON_ALIGNMENT_ALLOW_LIST } from "./icon-alignment-allow-list.ts";

/**
 * Runs in the page: `page.evaluate` sends only this function's text, so it imports nothing and calls nothing outside its body.
 */
/* oxlint-disable unicorn/consistent-function-scoping -- `page.evaluate` sends only this body, so its helpers cannot move out. */
export function measureIconAlignment(
  allow: readonly IconAllowEntry[]
): IconMeasurement {
  type Box = {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };

  type Line = {
    readonly rect: Box;
    readonly node: Node;
    readonly parent: Element;
  };

  type Unit = {
    readonly element: Element;
    readonly name: string;
    readonly box: Box;
    readonly ink: Box;
  };

  const CONTROLS = [
    "button",
    "a[href]",
    "summary",
    "label",
    ...[
      "button",
      "link",
      "tab",
      "menuitem",
      "option",
      "switch",
      "checkbox",
      "radio",
    ].map((role) => `[role=${role}]`),
  ].join(", ");

  const FORM_CONTROLS =
    "input, select, textarea, button, progress, meter, output";

  const INK_ELEMENTS = "path, circle, ellipse, line, polyline, polygon, rect";
  const NOT_DRAWN = "defs, clipPath, mask, symbol";

  const GUTTER_FREE = [
    "li",
    "a",
    "button",
    "label",
    ...["listitem", "menuitem", "option", "row", "treeitem"].map(
      (role) => `[role=${role}]`
    ),
  ].join(", ");

  // A spinner measures unrotated and a popup at its end state.
  const freeze = document.createElement("style");
  freeze.textContent =
    "*, *::before, *::after { animation: none !important; transition: none !important; }";
  document.head.append(freeze);

  try {
    const styles = new Map<Element, CSSStyleDeclaration>();

    const styleOf = (element: Element): CSSStyleDeclaration => {
      let style = styles.get(element);

      if (style === undefined) {
        style = getComputedStyle(element);
        styles.set(element, style);
      }

      return style;
    };

    const round = (value: number): number => Math.round(value * 10) / 10 || 0;

    const collapse = (text: string): string =>
      text.replaceAll(/\s+/g, " ").trim();

    const alphaOf = (color: string): number => {
      if (color === "transparent") return 0;

      const match =
        /\/\s*([\d.]+)(%?)\s*\)$/.exec(color) ??
        /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(color);

      if (match === null) return 1;

      return match[2] === "%" ? Number(match[1]) / 100 : Number(match[1]);
    };

    const isVisible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        element.checkVisibility({
          opacityProperty: true,
          visibilityProperty: true,
        })
      );
    };

    // A box shadow alone (focus ring, lift) and the 6% hover layer do not count.
    const isVisibleBox = (element: Element): boolean => {
      const style = styleOf(element);

      return (
        alphaOf(style.backgroundColor) >= 0.1 ||
        style.backgroundImage !== "none" ||
        (Number.parseFloat(style.borderLeftWidth) > 0 &&
          alphaOf(style.borderLeftColor) >= 0.1) ||
        (Number.parseFloat(style.borderRightWidth) > 0 &&
          alphaOf(style.borderRightColor) >= 0.1)
      );
    };

    const isScroller = (element: Element): boolean => {
      const { overflowX, overflowY } = styleOf(element);

      return /auto|scroll/.test(`${overflowX} ${overflowY}`);
    };

    const contentLeft = (element: Element): number => {
      const style = styleOf(element);

      return (
        element.getBoundingClientRect().left +
        Number.parseFloat(style.borderLeftWidth) +
        Number.parseFloat(style.paddingLeft)
      );
    };

    // Every text line, measured once. `sr-only` text sits in a 1 x 1 px box and never counts.
    const lines: Line[] = [];

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

    for (
      let node = walker.nextNode();
      node !== null;
      node = walker.nextNode()
    ) {
      const parent = node.parentElement;

      if (parent === null || !/\S/.test(node.textContent ?? "")) continue;
      const parentBox = parent.getBoundingClientRect();

      if (parentBox.width <= 1 || parentBox.height <= 1 || !isVisible(parent))
        continue;
      const range = document.createRange();
      range.selectNodeContents(node);

      for (const rect of range.getClientRects())
        if (rect.width > 0 && rect.height > 0)
          lines.push({ rect, node, parent });
    }

    // Only a control that shows text, and like `sr-only` text never a visually hidden 1 x 1 input
    // (P07-28).
    for (const field of document.body.querySelectorAll(
      "textarea, select, input:not([type=hidden], [type=checkbox], [type=radio], [type=range], [type=color], [type=file], [type=image], [type=button], [type=submit], [type=reset])"
    )) {
      const rect = field.getBoundingClientRect();

      if (rect.width <= 1 || rect.height <= 1 || !isVisible(field)) continue;
      const style = styleOf(field);
      const px = (value: string): number => Number.parseFloat(value);
      lines.push({
        rect: {
          left: rect.left + px(style.borderLeftWidth) + px(style.paddingLeft),
          top: rect.top + px(style.borderTopWidth) + px(style.paddingTop),
          right:
            rect.right - px(style.borderRightWidth) - px(style.paddingRight),
          bottom:
            rect.bottom - px(style.borderBottomWidth) - px(style.paddingBottom),
        },
        node: field,
        parent: field,
      });
    }

    const textHolders = new Map<Element, boolean>();

    const holdsText = (element: Element): boolean => {
      let holds = textHolders.get(element);

      if (holds === undefined) {
        holds = lines.some((line) => element.contains(line.node));
        textHolders.set(element, holds);
      }

      return holds;
    };

    const nameOf = (svg: Element): string => {
      const lucide = [...svg.classList].find((name) =>
        name.startsWith("lucide-")
      );

      if (lucide !== undefined) return lucide;
      const first = svg.classList[0];

      return first === undefined ? "svg" : `svg.${first}`;
    };

    // The drawn elements' geometry, widened by half the stroke, mapped to the page (P07-8).
    const inkOf = (svg: SVGSVGElement): Box => {
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;

      for (const part of svg.querySelectorAll<SVGGraphicsElement>(
        INK_ELEMENTS
      )) {
        if (part.closest(NOT_DRAWN) !== null) continue;
        const bbox = part.getBBox();
        const matrix = part.getScreenCTM();

        if (matrix === null || (bbox.width === 0 && bbox.height === 0))
          continue;
        const style = styleOf(part);

        const half =
          style.stroke === "none"
            ? 0
            : Number.parseFloat(style.strokeWidth) / 2;

        for (const [x, y] of [
          [bbox.x - half, bbox.y - half],
          [bbox.x + bbox.width + half, bbox.y - half],
          [bbox.x - half, bbox.y + bbox.height + half],
          [bbox.x + bbox.width + half, bbox.y + bbox.height + half],
        ] as const) {
          const point = new DOMPoint(x, y).matrixTransform(matrix);
          left = Math.min(left, point.x);
          top = Math.min(top, point.y);
          right = Math.max(right, point.x);
          bottom = Math.max(bottom, point.y);
        }
      }

      return left === Infinity
        ? svg.getBoundingClientRect()
        : { left, top, right, bottom };
    };

    const units = new Map<Element, Unit>();

    for (const svg of document.body.querySelectorAll("svg")) {
      if ((svg.parentElement?.closest("svg") ?? null) !== null) continue;
      const box = svg.getBoundingClientRect();

      if (
        box.width < 6 ||
        box.height < 6 ||
        box.width > 32 ||
        box.height > 32 ||
        !isVisible(svg)
      )
        continue;
      // An icon-only control.
      const control = svg.closest(CONTROLS);

      if (control !== null && !holdsText(control)) continue;
      let tile: Element | null = null;

      for (
        let element = svg.parentElement, level = 0;
        element !== null && level < 2 && tile === null;
        element = element.parentElement, level += 1
      ) {
        const rect = element.getBoundingClientRect();

        if (
          isVisibleBox(element) &&
          !holdsText(element) &&
          rect.width <= 40 &&
          rect.height <= 40
        )
          tile = element;
      }

      if (tile === null)
        units.set(svg, {
          element: svg,
          name: nameOf(svg),
          box,
          ink: inkOf(svg),
        });
      else if (!units.has(tile)) {
        const rect = tile.getBoundingClientRect();
        units.set(tile, {
          element: tile,
          name: `tile(${nameOf(svg)})`,
          box: rect,
          ink: rect,
        });
      }
    }

    const avatars: Element[] = [];

    // A dot, a ring, a step node, a swatch.
    for (const element of document.body.querySelectorAll("*")) {
      if (element instanceof SVGElement || units.has(element)) continue;
      const rect = element.getBoundingClientRect();

      // An initials avatar: a square visible box of at most 40 px that holds text (P07-87 b).
      if (
        rect.width <= 40 &&
        Math.abs(rect.width - rect.height) <= 1 &&
        isVisibleBox(element) &&
        holdsText(element) &&
        isVisible(element)
      )
        avatars.push(element);

      if (
        rect.width < 4 ||
        rect.height < 4 ||
        rect.width > 24 ||
        rect.height > 24
      )
        continue;

      // A switch thumb or a radio dot is part of a control with no text, as an icon-only control's
      // glyph is (P07-27).
      const control = element.closest(CONTROLS);

      if (
        (control !== null && !holdsText(control)) ||
        element.hasAttribute("role") ||
        element.hasAttribute("tabindex") ||
        element.matches(FORM_CONTROLS) ||
        (element instanceof HTMLElement && element.tabIndex >= 0) ||
        element.querySelector("svg") !== null ||
        !isVisibleBox(element) ||
        !isVisible(element) ||
        holdsText(element)
      )
        continue;
      units.set(element, {
        element,
        name: `box ${Math.round(rect.width)}x${Math.round(rect.height)}`,
        box: rect,
        ink: rect,
      });
    }

    const allUnits = [...units.values()].toSorted((a, b) =>
      a.element.compareDocumentPosition(b.element) &
      Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1
    );

    const overlapsX = (a: Box, b: Box): boolean =>
      a.left < b.right && b.left < a.right;

    const sameLine = (a: Box, b: Box): boolean =>
      a.top < b.bottom - 1 && b.top < a.bottom - 1;

    const centerY = (box: Box): number => (box.top + box.bottom) / 2;

    // The top line, and the left one on a tie (within 1 px).
    const firstOf = (candidates: readonly Line[]): Line | undefined =>
      candidates.reduce<Line | undefined>(
        (best, line) =>
          best === undefined ||
          line.rect.top < best.rect.top - 1 ||
          (Math.abs(line.rect.top - best.rect.top) <= 1 &&
            line.rect.left < best.rect.left)
            ? line
            : best,
        undefined
      );

    // Text lines and units by their box, the things a lead may not have on its left.
    type Item = { readonly rect: Box; readonly node: Node };

    const items: Item[] = [
      ...lines,
      ...allUnits.map((unit) => ({ rect: unit.box, node: unit.element })),
    ];

    const iconOnly: Item[] = [
      ...document.body.querySelectorAll(CONTROLS),
    ].flatMap((control) =>
      !holdsText(control) && isVisible(control)
        ? [{ rect: control.getBoundingClientRect(), node: control }]
        : []
    );

    const itemsIn = new Map<Element, Item[]>();
    const leads = new Map<Element, Map<Box, boolean>>();
    const textNodes = new Set(lines.map((line) => line.node));

    // A text line or unit with no text line and no unit left of it on its visual line, within 40 px;
    // a unit after text with no text after it is never a lead (P07-70).
    const isLead = (rect: Box, self: Node, scope: Element): boolean => {
      let known = leads.get(scope);

      if (known === undefined) {
        known = new Map();
        leads.set(scope, known);
      }

      let lead = known.get(rect);

      if (lead === undefined) {
        let inScope = itemsIn.get(scope);

        if (inScope === undefined) {
          inScope = items.filter((item) => scope.contains(item.node));
          itemsIn.set(scope, inScope);
        }

        lead = !inScope.some(
          (other) =>
            other.node !== self &&
            sameLine(other.rect, rect) &&
            other.rect.left < rect.left &&
            other.rect.right <= rect.left + 1 &&
            rect.left - other.rect.right <= 40
        );

        // P07-70: a unit after text with no text after it ends its line (a trailing spinner, dot
        // or chevron), so it introduces no column.
        if (lead && !textNodes.has(self)) {
          const onLine = inScope.filter(
            (other) => textNodes.has(other.node) && sameLine(other.rect, rect)
          );

          lead =
            !onLine.some((other) => other.rect.right <= rect.left + 1) ||
            onLine.some((other) => other.rect.left >= rect.right - 1);
        }

        // P07-99: a text line after an icon-only control (a version step) starts no column.
        if (lead && textNodes.has(self))
          lead = !iconOnly.some(
            (control) =>
              scope.contains(control.node) &&
              sameLine(control.rect, rect) &&
              control.rect.right <= rect.left + 1 &&
              rect.left - control.rect.right <= 40
          );

        known.set(rect, lead);
      }

      return lead;
    };

    const blockOf = (element: Element): Element => {
      let block = element;

      while (
        block.parentElement !== null &&
        /^(inline|contents)$/.test(styleOf(block).display)
      )
        block = block.parentElement;

      return block;
    };

    // Where a flex or grid parent places a block narrower than its content box: "start" for a
    // full-width block or one in normal flow (P07-22), "end" for a block pushed to the end of a flex
    // row by `justify-between` or an auto margin (P07-87 c).
    const placeOf = (block: Element): string => {
      const parent = block.parentElement;

      if (parent === null) return "start";
      const outer = styleOf(parent);
      const own = styleOf(block);

      const parentWidth =
        parent.getBoundingClientRect().width -
        Number.parseFloat(outer.borderLeftWidth) -
        Number.parseFloat(outer.borderRightWidth) -
        Number.parseFloat(outer.paddingLeft) -
        Number.parseFloat(outer.paddingRight);

      const blockBox = block.getBoundingClientRect();

      if (blockBox.width >= parentWidth - 1) return "start";

      if (
        /flex/.test(outer.display) &&
        !/column/.test(outer.flexDirection) &&
        own.flexGrow === "0" &&
        blockBox.left > contentLeft(parent) + 1 &&
        blockBox.right >=
          parent.getBoundingClientRect().right -
            Number.parseFloat(outer.borderRightWidth) -
            Number.parseFloat(outer.paddingRight) -
            1
      )
        return "end";

      return /flex/.test(outer.display)
        ? /column/.test(outer.flexDirection)
          ? own.alignSelf === "auto"
            ? outer.alignItems
            : own.alignSelf
          : outer.justifyContent
        : /grid/.test(outer.display)
          ? /auto|normal/.test(own.justifySelf)
            ? outer.justifyItems
            : own.justifySelf
          : "start";
    };

    // Centered and end-aligned text never counts: by `text-align` inside its block, or by where its
    // parent places the block.
    const startsOnEdge = (line: Line): boolean => {
      const block = blockOf(line.parent);

      return (
        Math.abs(line.rect.left - contentLeft(block)) <= 1 &&
        !/center|end|right/.test(placeOf(block))
      );
    };

    const textOf = (line: Line): string =>
      collapse(
        line.node instanceof HTMLInputElement ||
          line.node instanceof HTMLTextAreaElement
          ? line.node.value || line.node.placeholder
          : (line.node.textContent ?? "")
      ).slice(0, 40);

    const rowOf = (element: Element): Element | null => {
      let row = element.parentElement;

      for (let level = 0; row !== null && level < 6; level += 1) {
        if (holdsText(row)) return row;
        row = row.parentElement;
      }

      return null;
    };

    const columnOf = (row: Element): Element => {
      let column = row.parentElement;

      while (
        column !== null &&
        column !== document.body &&
        !isVisibleBox(column) &&
        !isScroller(column)
      )
        column = column.parentElement;

      return column ?? document.body;
    };

    // A line in another unit's row, right of that unit, is that row's label column: a description
    // under a menu label or a step's details. It is no column edge for the rows around it (P07-33).
    // The unit's own row never holds a candidate line, so the answer is the same for every unit.
    const unitRows = [
      ...allUnits.map((unit) => ({
        right: unit.box.right,
        row: rowOf(unit.element),
      })),
      // An avatar's row is the nearest ancestor with text outside the avatar (P07-87 b).
      ...avatars.map((avatar) => {
        const right = avatar.getBoundingClientRect().right;
        let row = avatar.parentElement;

        // Up to 6 levels, as rowOf; no row when none holds text.
        for (let level = 0; row !== null && level < 6; level += 1) {
          const candidate = row;

          if (
            lines.some(
              (line) =>
                candidate.contains(line.node) && !avatar.contains(line.node)
            )
          )
            return { right, row };
          row = row.parentElement;
        }

        return { right, row: null };
      }),
    ];

    const iconRowLines = new Map<Line, boolean>();

    const inIconRow = (line: Line): boolean => {
      let known = iconRowLines.get(line);

      if (known === undefined) {
        known = unitRows.some(
          ({ right, row }) =>
            right <= line.rect.left + 1 && row?.contains(line.node) === true
        );
        iconRowLines.set(line, known);
      }

      return known;
    };

    const childOf = (row: Element, node: Node): Node => {
      let child = node;

      while (child.parentNode !== null && child.parentNode !== row)
        child = child.parentNode;

      return child;
    };

    // A unit at the end of its flex row, more than 40 px after the item before it: a trigger's
    // chevron (P07-87 c).
    const pushedToEnd = (unit: Unit): boolean => {
      const parent = unit.element.parentElement;

      if (parent === null) return false;
      const style = styleOf(parent);

      if (!/flex/.test(style.display) || /column/.test(style.flexDirection))
        return false;

      const before = items.flatMap((item) =>
        item.node !== unit.element &&
        parent.contains(item.node) &&
        sameLine(item.rect, unit.box) &&
        item.rect.right <= unit.box.left + 1
          ? [item.rect.right]
          : []
      );

      return (
        unit.box.right >=
          parent.getBoundingClientRect().right -
            Number.parseFloat(style.borderRightWidth) -
            Number.parseFloat(style.paddingRight) -
            1 && unit.box.left - Math.max(contentLeft(parent), ...before) > 40
      );
    };

    // A unit whose row, or a block around that row below the column, is centered (P07-87 a).
    const inCenteredStack = (element: Element, column: Element): boolean => {
      for (
        let block = rowOf(element);
        block !== null && block !== column;
        block = block.parentElement
      )
        if (/center/.test(placeOf(block))) return true;

      return false;
    };

    const relations: IconRelation[] = [];
    let measured = 0;

    for (const unit of allUnits) {
      if (allow.some((entry) => unit.element.closest(entry.selector) !== null))
        continue;
      measured += 1;
      const row = rowOf(unit.element);
      // P07-98: a unit in a table cell that holds no text has no row beyond its cell.
      const cell = unit.element.closest("td, th, [role=cell], [role=gridcell]");

      if (row === null || (cell !== null && !cell.contains(row))) continue;
      const column = columnOf(row);
      const { box, ink } = unit;

      const rowText = collapse(row.textContent ?? "")
        .slice(0, 40)
        .trimEnd();

      // `box` when the icon's own box is off too, else the glyph's side bearing.
      const causeOf = (boxOffset: number): IconRelation["cause"] =>
        Math.abs(round(boxOffset)) > 1 ? "box" : "bearing";

      const add = (
        rule: IconRelation["rule"],
        offset: number,
        cause: IconRelation["cause"],
        reference: string
      ): void => {
        relations.push({
          rule,
          cause,
          offsetPx: round(offset),
          icon: unit.name,
          row: rowText,
          reference,
        });
      };

      const rowLines = lines.filter((line) => row.contains(line.node));

      const first = firstOf(
        rowLines.filter((line) => !overlapsX(line.rect, box))
      );

      // Within 24 px of the first line, or right of an icon that shares a line with that line's
      // text block, however far down: a long text beside a centered icon (R07-1).
      const beside =
        first !== undefined &&
        (Math.abs(centerY(ink) - centerY(first.rect)) <= 24 ||
          (first.rect.left >= box.right - 1 &&
            sameLine(box, blockOf(first.parent).getBoundingClientRect())));

      // Rule 1, center.
      if (beside)
        add(
          "center",
          centerY(ink) - centerY(first.rect),
          causeOf(centerY(box) - centerY(first.rect)),
          `text "${textOf(first)}"`
        );

      // Rule 2, start beside: the column's text edge, else the icon column of the rows above.
      let boxed = false;

      for (
        let element = unit.element.parentElement;
        element !== null && !boxed;
        element = element === row ? null : element.parentElement
      )
        boxed = isVisibleBox(element);

      if (beside && !boxed && isLead(unit.box, unit.element, row)) {
        const insideBox = (element: Element): boolean => {
          for (
            let current: Element | null = element;
            current !== null && current !== column;
            current = current.parentElement
          )
            // A line in another scroller moves with its scroll, as a slide number in the strip
            // above a button row does, so it marks no column edge (czjw.176).
            if (isVisibleBox(current) || isScroller(current)) return true;

          return false;
        };

        const edge = lines
          .filter(
            (line) =>
              column.contains(line.node) &&
              !row.contains(line.node) &&
              line.rect.left >= ink.left - 40 &&
              line.rect.left <= first.rect.left + 1 &&
              !insideBox(line.parent) &&
              startsOnEdge(line) &&
              isLead(line.rect, line.node, column) &&
              !inIconRow(line)
          )
          .toSorted(
            (a, b) =>
              Math.abs(centerY(a.rect) - centerY(ink)) -
              Math.abs(centerY(b.rect) - centerY(ink))
          )[0];

        if (edge === undefined) {
          const icon = allUnits
            .filter(
              (other) =>
                other !== unit &&
                column.contains(other.element) &&
                !row.contains(other.element) &&
                other.ink.bottom <= ink.top + 1 &&
                Math.abs(other.ink.left - ink.left) <= 40 &&
                isLead(other.box, other.element, column) &&
                // A unit pushed to the end of its flex row starts no icon column (P07-87 c).
                !pushedToEnd(other) &&
                // A centered stack has no icon column (P07-87 a).
                !inCenteredStack(other.element, column)
            )
            .toSorted(
              (a, b) =>
                Math.abs(centerY(a.ink) - centerY(ink)) -
                Math.abs(centerY(b.ink) - centerY(ink))
            )[0];

          if (icon !== undefined)
            add(
              "start",
              ink.left - icon.ink.left,
              causeOf(box.left - icon.ink.left),
              `icon ${icon.name}`
            );
        } else
          add(
            "start",
            ink.left - edge.rect.left,
            causeOf(box.left - edge.rect.left),
            `text "${textOf(edge)}"`
          );
      }

      // Rule 3, start above: the first line under the icon (P07-21).
      const under = firstOf(
        rowLines.filter(
          (line) =>
            overlapsX(line.rect, box) &&
            ink.bottom <= line.rect.top + 1 &&
            ink.bottom >= line.rect.top - 24
        )
      );

      if (under !== undefined && startsOnEdge(under))
        add(
          "start",
          ink.left - under.rect.left,
          causeOf(box.left - under.rect.left),
          `text "${textOf(under)}"`
        );

      // Rule 4, slot: a parent that holds only this unit and is wider.
      const slot = unit.element.parentElement;

      if (
        slot !== null &&
        !holdsText(slot) &&
        !allUnits.some(
          (other) => other !== unit && slot.contains(other.element)
        )
      ) {
        const style = styleOf(slot);

        const width =
          slot.getBoundingClientRect().width -
          Number.parseFloat(style.borderLeftWidth) -
          Number.parseFloat(style.borderRightWidth) -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight);

        if (width > box.right - box.left + 1) {
          add(
            "slot",
            box.left - contentLeft(slot),
            "box",
            `slot ${Math.round(width)}px`
          );
        }
      }

      // Rule 5, gutter: the icon hangs beside a stack of text blocks (P07-11, P07-23). A table
      // cell's media and a trailing unit are no gutter (P07-34).
      if (
        beside &&
        ink.left < first.rect.left &&
        !row.matches(GUTTER_FREE) &&
        row.closest("td, th, [role=cell], [role=gridcell]") === null
      ) {
        const lineChild = childOf(row, first.node);
        let held = false;

        for (
          let element: Element | null = row;
          element !== null && !held;
          element = element === column ? null : element.parentElement
        )
          held = isVisibleBox(element);

        const blocks = [
          ...new Set(
            rowLines.flatMap((line) =>
              lineChild.contains(line.node) ? [blockOf(line.parent)] : []
            )
          ),
        ].map((block) => block.getBoundingClientRect());

        const stacked = blocks.some((upper) =>
          blocks.some((lower) => lower.top >= upper.bottom - 1)
        );

        if (!held && stacked && lineChild !== childOf(row, unit.element))
          add(
            "gutter",
            ink.left - first.rect.left,
            "box",
            `text "${textOf(first)}"`
          );
      }
    }

    return { units: measured, relations };
  } finally {
    freeze.remove();
  }
}
/* oxlint-enable unicorn/consistent-function-scoping */

/**
 * One line for each relation more than 1 px off, deduplicated and sorted, for example
 * `start +4.0 px box: tile(lucide-sparkles) in "Worked for 38 seconds" against text "Here is the chart."`.
 */
export function iconAlignmentProblems(
  relations: readonly IconRelation[]
): string[] {
  return [
    ...new Set(
      relations.flatMap(({ rule, cause, offsetPx, icon, row, reference }) =>
        Math.abs(offsetPx) > 1
          ? [
              `${rule} ${offsetPx > 0 ? "+" : ""}${offsetPx.toFixed(1)} px ${cause}: ${icon} in "${row}" against ${reference}`,
            ]
          : []
      )
    ),
  ].toSorted();
}
