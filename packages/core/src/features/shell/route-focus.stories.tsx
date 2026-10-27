import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor } from "storybook/test";

import { PageSkeleton } from "./page-skeleton.tsx";
import { RouteFocus } from "./route-focus.tsx";

/**
 * The focus rule after a client navigation (NAV-1). The old page leaves the DOM, so focus moves to
 * the new page's heading, or to its `main` when it has none, once any loading skeleton is gone.
 */
const meta = {
  title: "Core/Shell/Route focus",
  component: RouteFocus,
  tags: ["autodocs"],
  args: { path: "/orders" },
} satisfies Meta<typeof RouteFocus>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A host whose router holds the skeleton for 300 ms, as a loading fallback does. */
function Pages() {
  const [path, setPath] = useState("/orders");
  const [ready, setReady] = useState(true);

  const open = (next: string) => {
    setPath(next);
    setReady(false);
    setTimeout(() => setReady(true), 300);
  };

  return (
    <>
      <RouteFocus path={path} />
      <button type="button" onClick={() => open("/shipments")}>
        Open Shipments
      </button>
      <button type="button" onClick={() => open("/denied")}>
        Open a page with no heading
      </button>
      <div data-shell-content="">
        {!ready ? (
          <PageSkeleton label="Loading the page…" />
        ) : path === "/denied" ? (
          <main>You may not view this page.</main>
        ) : (
          <main>
            <h1>{path === "/orders" ? "Orders" : "Shipments"}</h1>
          </main>
        )}
      </div>
    </>
  );
}

export const MovesFocusToTheNewPage: Story = {
  render: () => <Pages />,
  play: async ({ canvas }) => {
    // A document load keeps the browser's own focus.
    await expect(
      canvas.getByRole("heading", { name: "Orders" })
    ).not.toHaveFocus();

    // A keyboard press, because only then does the browser draw its own ring on the heading.
    canvas.getByRole("button", { name: "Open Shipments" }).focus();
    await userEvent.keyboard("{Enter}");
    const heading = await canvas.findByRole("heading", { name: "Shipments" });
    await waitFor(() => expect(heading).toHaveFocus());
    // The heading is not a control, so it draws no focus ring (UI-1, phase 08).
    await expect(getComputedStyle(heading).outlineStyle).toBe("none");

    await userEvent.click(
      canvas.getByRole("button", { name: "Open a page with no heading" })
    );
    await waitFor(() => expect(canvas.getByRole("main")).toHaveFocus());
  },
};
