import JSZip from "jszip";

const CONTENT_TYPES = "[Content_Types].xml";

/**
 * Drops each `[Content_Types].xml` override that names a part the zip does not hold. pptxgenjs
 * 4.0.1 lists one slide master per slide but writes one (upstream #1444), and PowerPoint answers
 * a missing part with its repair dialog. A file with nothing to drop comes back as it was.
 */
export async function dropMissingOverrides(bytes: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file(CONTENT_TYPES)?.async("string");

  if (xml === undefined) return bytes;

  const fixed = xml.replace(
    /<Override PartName="\/([^"]+)"[^>]*\/>/g,
    (override, part: string) => (zip.file(part) === null ? "" : override)
  );

  if (fixed === xml) return bytes;

  zip.file(CONTENT_TYPES, fixed);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
