import type { Config } from "dompurify";

/**
 * The SVG profile of R-37: SVG elements and filters only, with `foreignObject` and `style`
 * forbidden. DOMPurify's default `ALLOWED_URI_REGEXP` stays, so drawing attributes such as
 * `viewBox`, `d` and `fill="url(#g)"` survive; the same-document rule is enforced by the
 * attribute hook below instead.
 */
const SVG_PROFILE: Config = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ["foreignObject", "style"],
  FORBID_ATTR: ["style"],
};

type Sanitizer = {
  /** Sanitizes one SVG string and returns it as well-formed XML. */
  readonly toXml: (svg: string) => string;
};

let loading: Promise<Sanitizer> | undefined;

/**
 * Builds the one jsdom window and DOMPurify instance on the first SVG upload, never at import or
 * context build, so a deployment that receives no SVG pays for neither (R-19). jsdom is the DOM
 * DOMPurify needs on the server (tech stack, "SVG sanitizer"). A failed import is not cached, so
 * a later upload retries it.
 */
async function loadSanitizer(): Promise<Sanitizer> {
  if (loading === undefined) {
    loading = buildSanitizer().catch((error: Error) => {
      loading = undefined;

      throw error;
    });
  }

  return loading;
}

async function buildSanitizer(): Promise<Sanitizer> {
  const [{ default: createDOMPurify }, { JSDOM }] = await Promise.all([
    import("dompurify"),
    import("jsdom"),
  ]);

  const window = new JSDOM("").window;
  const purify = createDOMPurify(window);

  // "Only references inside the file" (R-37). Every `href`/`xlink:href` must be a same-document
  // `#` reference, and no attribute may hold a `url(...)` that points outside the document. This
  // runs on every attribute, so an external link or paint is dropped while `url(#g)` survives.
  purify.addHook("uponSanitizeAttribute", (_node, data) => {
    const value = data.attrValue.replace(/\s/g, "");

    if (
      (data.attrName === "href" || data.attrName === "xlink:href") &&
      !value.startsWith("#")
    ) {
      data.keepAttr = false;
    }

    if (/url\((?!['"]?#)/i.test(value)) data.keepAttr = false;
  });

  const serializer = new window.XMLSerializer();

  return {
    toXml: (svg) => {
      const fragment = purify.sanitize(svg, {
        ...SVG_PROFILE,
        RETURN_DOM_FRAGMENT: true,
      });

      const element = fragment.querySelector("svg");

      if (element === null || element.children.length === 0) {
        throw new Error("The SVG is empty after sanitizing.");
      }

      // XML, not HTML, so U+00A0 stays a raw character and the bytes reparse as image/svg+xml.
      return serializer.serializeToString(element);
    },
  };
}

/**
 * Sanitizes one uploaded SVG and refuses a file that is empty afterwards (R-37). The sanitized
 * markup replaces the original bytes before they reach the adapter, so a script, an event
 * handler, an external reference or a foreign object never lands in the blob table.
 */
export async function sanitizeUploadedSvg(bytes: Buffer): Promise<Buffer> {
  const { toXml } = await loadSanitizer();

  return Buffer.from(toXml(bytes.toString("utf8")), "utf8");
}
