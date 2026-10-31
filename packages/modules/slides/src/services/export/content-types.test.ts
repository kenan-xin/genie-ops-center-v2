import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { dropMissingOverrides } from "./content-types.ts";

const override = (part: string) =>
  `<Override PartName="/${part}" ContentType="application/xml"/>`;

describe("dropMissingOverrides", () => {
  it("drops the override of a missing part and keeps the one of a present part", async () => {
    const zip = new JSZip();

    zip.file("ppt/slides/slide1.xml", "<p:sld/>");
    zip.file(
      "[Content_Types].xml",
      `<Types>${override("ppt/slides/slide1.xml")}${override("ppt/slideMasters/slideMaster2.xml")}</Types>`
    );

    const fixed = await JSZip.loadAsync(
      await dropMissingOverrides(
        await zip.generateAsync({ type: "nodebuffer" })
      )
    );

    expect(await fixed.file("[Content_Types].xml")?.async("string")).toBe(
      `<Types>${override("ppt/slides/slide1.xml")}</Types>`
    );
  });
});
