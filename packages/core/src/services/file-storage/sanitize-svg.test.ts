import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { sanitizeUploadedSvg } from "./sanitize-svg.ts";

async function sanitized(svg: string): Promise<string> {
  return (await sanitizeUploadedSvg(Buffer.from(svg))).toString("utf8");
}

/** Parses the stored bytes the way a browser reads an image/svg+xml file. */
function parseSvg(markup: string) {
  const dom = new JSDOM("");

  const document = new dom.window.DOMParser().parseFromString(
    markup,
    "image/svg+xml"
  );

  return { document, close: () => dom.window.close() };
}

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">';

describe("the uploaded SVG sanitizer (R-37)", () => {
  it.each([
    {
      what: "a script element",
      markup: "<script>alert(1)</script>",
      leak: "alert(1)",
    },
    {
      what: "an event handler",
      markup: '<g onload="alert(2)"><path d="M0 0" /></g>',
      leak: "onload",
    },
    {
      what: "a javascript: link",
      markup: '<a href="javascript:alert(3)"><text>safe</text></a>',
      leak: "javascript:",
    },
    {
      what: "a foreignObject",
      markup: "<foreignObject><div>unsafe</div></foreignObject>",
      leak: "foreignObject",
    },
    {
      what: "an external image href",
      markup: '<image href="https://attacker.invalid/image.png" />',
      leak: "attacker.invalid",
    },
    {
      what: "an external xlink:href",
      markup:
        '<use xlink:href="https://attacker.invalid/sprite.svg#payload" />',
      leak: "attacker.invalid",
    },
    {
      what: "a protocol-relative xlink:href",
      markup:
        '<a xlink:href="//attacker.invalid/page"><text>external</text></a>',
      leak: "attacker.invalid",
    },
    {
      what: "an external url() paint",
      markup:
        '<path fill="url(https://attacker.invalid/fill.svg#g)" d="M0 0" />',
      leak: "attacker.invalid",
    },
    {
      what: "a CSS-escaped url() paint",
      markup:
        '<path fill="u\\72l(https://attacker.invalid/escaped.svg#g)" d="M0 0" />',
      leak: "attacker.invalid",
    },
    {
      what: "a leading-escape url() filter",
      markup:
        '<path filter="\\75rl(https://attacker.invalid/escaped.svg#g)" d="M0 0" />',
      leak: "attacker.invalid",
    },
    {
      what: "an entity-escaped url() mask",
      markup:
        '<path mask="u&#92;72l(//attacker.invalid/escaped-mask)" d="M0 0" />',
      leak: "attacker.invalid",
    },
    {
      what: "a style element",
      markup: "<style>path { fill: url(https://attacker.invalid/s) }</style>",
      leak: "attacker.invalid",
    },
  ])("removes $what", async ({ markup, leak }) => {
    // A drawable sibling keeps the result non-empty, so only the removal is under test.
    const result = await sanitized(
      `${SVG_OPEN}<rect width="1" height="1" />${markup}</svg>`
    );

    expect(result).toContain("<rect");
    expect(result).not.toContain(leak);
  });

  it("preserves drawing attributes and same-document paint references in a logo", async () => {
    const result = await sanitized(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
        '<path d="M0 0L64 64" stroke="#000" stroke-width="4" />' +
        '<circle cx="32" cy="32" r="10" fill="blue" />' +
        '<defs><linearGradient id="g"><stop offset="0%" stop-color="red" /></linearGradient></defs>' +
        '<rect x="4" y="4" width="5" height="5" fill="url(#g)" />' +
        "</svg>"
    );

    const { document, close } = parseSvg(result);

    try {
      const svg = document.documentElement;

      expect(svg.getAttribute("width")).toBe("64");
      expect(svg.getAttribute("viewBox")).toBe("0 0 64 64");
      expect(svg.querySelector("path")?.getAttribute("d")).toBe("M0 0L64 64");
      expect(svg.querySelector("path")?.getAttribute("stroke")).toBe("#000");
      expect(svg.querySelector("circle")?.getAttribute("fill")).toBe("blue");
      expect(svg.querySelector("rect")?.getAttribute("fill")).toBe("url(#g)");
      expect(document.getElementById("g")?.tagName).toBe("linearGradient");
    } finally {
      close();
    }
  });

  it.each([
    {
      what: "a non-breaking space",
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>North\u00a0Star</text></svg>',
    },
    {
      what: "XML-invalid control characters",
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>a\u0001b\u000bc\uffffd</text></svg>',
    },
    {
      what: "a DOCTYPE internal subset",
      svg: '<!DOCTYPE svg [<!ENTITY label "North Star">]><svg xmlns="http://www.w3.org/2000/svg"><text>&label;</text></svg>',
    },
  ])("returns well-formed SVG XML for input with $what", async ({ svg }) => {
    const result = await sanitized(svg);
    const { document, close } = parseSvg(result);

    try {
      expect(document.querySelector("parsererror")).toBeNull();
      expect(document.documentElement.tagName).toBe("svg");
    } finally {
      close();
    }
  });

  it("refuses an SVG with no drawable content after sanitizing", async () => {
    await expect(
      sanitized(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script>' +
          "<foreignObject><div>removed</div></foreignObject></svg>"
      )
    ).rejects.toThrow("The SVG is empty after sanitizing.");
  });
});
