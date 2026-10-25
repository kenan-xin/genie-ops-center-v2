import { describe, expect, it } from "vitest";

import { brandingView } from "./__fixtures__/branding.ts";
import {
  changedByTab,
  changedFields,
  createBrandingDraftStore,
  imageFor,
} from "./draft-store.ts";

const LOGO = {
  fileId: "7c0e7f3a-3b0b-4d8e-9a43-1f2d3c4b5a69",
  fileName: "logo.png",
  mimeType: "image/png",
  sizeBytes: 2048,
  scanStatus: "skipped",
  url: "https://ops.example.test/api/files/download?token=t",
} as const;

describe("the branding draft store (R-43, R-44)", () => {
  it("counts no change after a field is set and set back", () => {
    const store = createBrandingDraftStore(brandingView());

    store.getState().set("companyName", "Acme");
    expect(changedFields(store.getState())).toEqual(["companyName"]);

    store.getState().set("companyName", brandingView().draft.companyName);
    expect(changedFields(store.getState())).toEqual([]);
  });

  it("groups three edits on three tabs in tab order with their labels", () => {
    const store = createBrandingDraftStore(brandingView());

    store.getState().set("loginWelcomeText", "Welcome");
    store.getState().set("primaryColor", "#0f766e");
    store.getState().set("productName", "Acme Ops");

    expect(changedFields(store.getState())).toHaveLength(3);
    expect(changedByTab(store.getState())).toEqual([
      { tab: "identity", title: "Identity", fields: ["Product name"] },
      { tab: "colors", title: "Colors and theme", fields: ["Primary color"] },
      { tab: "sign-in", title: "Sign-in page", fields: ["Welcome text"] },
    ]);
  });

  it("clears the count on rebase", () => {
    const store = createBrandingDraftStore(brandingView());

    store.getState().set("companyName", "Acme");
    store.getState().rebase(brandingView({ companyName: "Acme" }));
    expect(changedFields(store.getState())).toEqual([]);
    expect(store.getState().draft.companyName).toBe("Acme");
  });

  it("puts an uploaded image id in its slot column and keeps its view for the preview", () => {
    const store = createBrandingDraftStore(brandingView());

    store.getState().setImage("logoMark", LOGO);

    expect(store.getState().draft.logoMarkFileId).toBe(LOGO.fileId);
    expect(imageFor(store.getState(), "logoMark")).toEqual(LOGO);
    expect(changedFields(store.getState())).toEqual(["logoMarkFileId"]);

    store.getState().setImage("logoMark", null);
    expect(imageFor(store.getState(), "logoMark")).toBeUndefined();
    expect(changedFields(store.getState())).toEqual([]);
  });
});
