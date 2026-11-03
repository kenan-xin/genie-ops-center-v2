import { describe, expect, it } from "vitest";

import { createGrantsDraftStore, draftCounts } from "./grants-draft-store.ts";

const draftOf = (store: ReturnType<typeof createGrantsDraftStore>) => {
  const { add, change, remove } = store.getState();

  return { add, change, remove };
};

describe("the Access grants draft (V5)", () => {
  it("cancels an Add that the admin removes again", () => {
    const store = createGrantsDraftStore();

    store.getState().stageAdd([{ row: "slides", roleId: "r-slides-editor" }]);
    expect(draftCounts(store.getState())).toEqual({
      add: 1,
      change: 0,
      remove: 0,
    });

    store.getState().stageRemove(["slides"]);
    expect(draftOf(store)).toEqual({ add: {}, change: {}, remove: [] });
  });

  it("restores a removed row that the admin adds again", () => {
    const store = createGrantsDraftStore();

    store.getState().stageRemove(["invoices"]);
    expect(draftCounts(store.getState())).toEqual({
      add: 0,
      change: 0,
      remove: 1,
    });

    store
      .getState()
      .stageAdd([{ row: "invoices", roleId: "r-invoices-viewer" }]);
    expect(draftOf(store)).toEqual({ add: {}, change: {}, remove: [] });
  });

  it("clears a change set back to the saved role", () => {
    const store = createGrantsDraftStore();

    store
      .getState()
      .setRole("invoices", "r-invoices-finance", "r-invoices-viewer");
    expect(draftCounts(store.getState())).toEqual({
      add: 0,
      change: 1,
      remove: 0,
    });

    store
      .getState()
      .setRole("invoices", "r-invoices-viewer", "r-invoices-viewer");
    expect(draftOf(store).change).toEqual({});
  });

  it("drops a staged change when the row is removed", () => {
    const store = createGrantsDraftStore();

    store
      .getState()
      .setRole("invoices", "r-invoices-finance", "r-invoices-viewer");
    store.getState().stageRemove(["invoices"]);

    expect(draftOf(store)).toEqual({
      add: {},
      change: {},
      remove: ["invoices"],
    });
    expect(draftCounts(store.getState())).toEqual({
      add: 0,
      change: 0,
      remove: 1,
    });
  });

  it("keeps an edit staged while a save was in flight", () => {
    const store = createGrantsDraftStore();

    store.getState().stageAdd([{ row: "slides", roleId: "r-slides-editor" }]);
    store.getState().stageRemove(["core:ask"]);

    const { add, change, remove } = store.getState();

    store
      .getState()
      .stageAdd([{ row: "placeholder", roleId: "r-placeholder-user" }]);
    store
      .getState()
      .setRole("invoices", "r-invoices-finance", "r-invoices-viewer");
    store.getState().clearSaved({ add, change, remove });

    expect(draftOf(store)).toEqual({
      add: { placeholder: "r-placeholder-user" },
      change: { invoices: "r-invoices-finance" },
      remove: [],
    });
  });

  it("sets the role of a pending Add on the Add", () => {
    const store = createGrantsDraftStore();

    store
      .getState()
      .stageAdd([{ row: "invoices", roleId: "r-invoices-viewer" }]);
    store.getState().setRole("invoices", "r-invoices-finance", undefined);

    expect(draftOf(store)).toEqual({
      add: { invoices: "r-invoices-finance" },
      change: {},
      remove: [],
    });
  });
});
