import type { Config } from "dompurify";

/**
 * The SVG profile of R-37: SVG elements and filters only, `foreignObject` and `style` forbidden,
 * and `ALLOWED_URI_REGEXP` narrowed to a same-document `#`-reference so an absolute or
 * `javascript:` URL on any URI attribute is dropped. The bytes this returns are what gets stored.
 */
const SVG_PROFILE: Config = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ["foreignObject", "style"],
  FORBID_ATTR: ["style"],
  ALLOWED_URI_REGEXP: /^#/,
};

type Sanitizer = {
  readonly sanitize: (svg: string) => string;
  /** True when the sanitized markup still holds at least one element inside the `svg` root. */
  readonly hasDrawableContent: (markup: string) => boolean;
};

let loading: Promise<Sanitizer> | undefined;

/**
 * Builds the one jsdom window and DOMPurify instance on the first SVG upload, never at import or
 * context build, so a deployment that receives no SVG pays for neither (R-19). jsdom is the DOM
 * DOMPurify needs on the server (tech stack, "SVG sanitizer").
 */
async function loadSanitizer(): Promise<Sanitizer> {
  loading ??= (async () => {
    const [{ default: createDOMPurify }, { JSDOM }] = await Promise.all([
      import("dompurify"),
      import("jsdom"),
    ]);

    const window = new JSDOM("").window;
    const purify = createDOMPurify(window);

    return {
      sanitize: (svg) => purify.sanitize(svg, SVG_PROFILE),
      hasDrawableContent: (markup) => {
        const container = window.document.createElement("div");

        container.innerHTML = markup;

        const svg = container.querySelector("svg");

        return svg !== null && svg.children.length > 0;
      },
    };
  })();

  return loading;
}

/**
 * Sanitizes one uploaded SVG and refuses a file that is empty afterwards (R-37). The sanitized
 * markup replaces the original bytes before they reach the adapter, so a script, an event
 * handler, an external reference or a foreign object never lands in the blob table.
 */
export async function sanitizeUploadedSvg(bytes: Buffer): Promise<Buffer> {
  const { sanitize, hasDrawableContent } = await loadSanitizer();
  const sanitized = sanitize(bytes.toString("utf8"));

  if (!hasDrawableContent(sanitized)) {
    throw new Error("The SVG is empty after sanitizing.");
  }

  return Buffer.from(sanitized, "utf8");
}
