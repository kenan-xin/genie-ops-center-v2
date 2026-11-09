/**
 * A surface as the screens see it, and the address of one of its records. This file imports
 * nothing, so the browser bundle can use it.
 */
export type SurfaceView = {
  readonly id: string;
  readonly name: string;
  readonly recordPage: string;
  readonly acceptsHandoff: boolean;
};

/** recordPage with its one `:param` segment replaced by the encoded id. */
export function recordAddress(recordPage: string, recordId: string): string {
  return recordPage
    .split("/")
    .map((segment) =>
      segment.startsWith(":") ? encodeURIComponent(recordId) : segment
    )
    .join("/");
}

/** The surface whose recordPage matches `path`, with the decoded id; undefined for any other path. */
export function surfaceRecordOf(
  surfaces: readonly SurfaceView[],
  path: string
): { readonly surface: SurfaceView; readonly recordId: string } | undefined {
  const segments = path.split("/");

  for (const surface of surfaces) {
    const pattern = surface.recordPage.split("/");

    if (pattern.length !== segments.length) continue;

    let recordId: string | undefined;

    const matches = pattern.every((segment, index) => {
      const given = segments[index] ?? "";

      if (!segment.startsWith(":")) return segment === given;

      recordId = given;

      return given !== "";
    });

    if (matches && recordId !== undefined) {
      return { surface, recordId: decodeURIComponent(recordId) };
    }
  }

  return undefined;
}
