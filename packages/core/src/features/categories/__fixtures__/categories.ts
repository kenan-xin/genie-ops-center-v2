import type { AssignableModuleView, CategoryListView } from "../types.ts";

export const FIXTURE_LIST: CategoryListView = {
  categories: [
    { id: "c-ops", name: "Operations", position: 0, moduleCount: 1 },
    { id: "c-fin", name: "Finance", position: 1, moduleCount: 2 },
    { id: "c-legal", name: "Legal", position: 2, moduleCount: 0 },
  ],
  ungroupedCount: 3,
};

export const FIXTURE_ASSIGNABLE: readonly AssignableModuleView[] = [
  { id: "fixture", displayName: "Fixture", enabled: true, categoryId: "c-ops" },
  {
    id: "contracts",
    displayName: "Contracts",
    enabled: true,
    categoryId: "c-fin",
  },
  {
    id: "invoices",
    displayName: "Invoices",
    enabled: true,
    categoryId: "c-fin",
  },
  {
    id: "requests",
    displayName: "Service requests",
    enabled: true,
    categoryId: null,
  },
  // Switched off, still placeable (R-91a).
  { id: "dormant", displayName: "Dormant", enabled: false, categoryId: null },
  // Points at a deleted category, so it reads as no category (R-91).
  {
    id: "assets",
    displayName: "Asset register",
    enabled: true,
    categoryId: "c-gone",
  },
];
