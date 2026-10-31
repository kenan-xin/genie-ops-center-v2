import JSZip from "jszip";

/**
 * Opens an exported deck as the zip it is, so a test proves native chart parts and media without a
 * renderer (AC-10). `chartParts` are the sorted `ppt/charts/chart<n>.xml` names.
 */
export async function readPptx(bytes: Buffer): Promise<{
  readonly slideCount: number;
  readonly chartParts: readonly string[];
  readonly mediaParts: readonly string[];
  readonly xmlOf: (part: string) => Promise<string>;
}> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);

  const matching = (pattern: RegExp) =>
    names.filter((name) => pattern.test(name)).toSorted();

  return {
    slideCount: matching(/^ppt\/slides\/slide\d+\.xml$/).length,
    chartParts: matching(/^ppt\/charts\/chart\d+\.xml$/),
    mediaParts: matching(/^ppt\/media\//),
    async xmlOf(part) {
      const entry = zip.file(part);

      if (entry === null) throw new Error(`The deck has no part ${part}.`);

      return entry.async("string");
    },
  };
}
