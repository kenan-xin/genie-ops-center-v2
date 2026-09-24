import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ThemeProvider } from "../theme/theme-provider.tsx";
import { themeTokens } from "../theme/tokens.ts";
import { DeploymentDiagnostics } from "./deployment-diagnostics.tsx";

/**
 * One deployment's real shape, used by every story here so each one asserts on
 * the same render. The values are what a Section 0 deployment actually holds:
 * one database, the modules compiled into this image, and the keys the stub
 * grant reader returns. There is no signed-in user yet, which the component
 * has to say rather than fill in.
 */
const FIXTURE = {
  database: "genie_ops",
  contextId: "7f1c0f9e-3a2b-4c5d-8e6f-0a1b2c3d4e5f",
  modules: ["placeholder"],
  permissions: ["placeholder:read"],
};

const meta = {
  title: "UI/DeploymentDiagnostics",
  component: DeploymentDiagnostics,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Genie Ops Center devtools panel. It reports what this deployment really is: the database it is connected to, the one process context id, the modules compiled into the image, and the permissions the Section 0 stub grants. It states plainly that no user is signed in, because Section 0 has no identity yet and a panel that invented one would be worse than no panel.",
      },
    },
    a11y: { test: "error" },
  },
  args: FIXTURE,
} satisfies Meta<typeof DeploymentDiagnostics>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Deployment" })
    ).toBeVisible();

    // Each value is asserted through the term that labels it, never by
    // position. A definition list carries that association structurally, and
    // `term` is not a name-from-content role, so the pairing is what to read.
    const database = canvas.getByText("Database");

    await expect(database.tagName).toBe("DT");
    await expect(database.nextElementSibling).toHaveTextContent("genie_ops");

    const context = canvas.getByText("Context");

    await expect(context.nextElementSibling).toHaveTextContent(
      FIXTURE.contextId
    );
    await expect(canvas.getByText("placeholder")).toBeVisible();
    await expect(canvas.getByText("placeholder:read")).toBeVisible();
  },
};

// The truthfulness requirement, as an assertion. Section 0 authenticates
// nobody, so the panel must say so and must not render a name, an id or a
// group for a user that does not exist.
export const NoSignedInUser: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("No user is signed in. Section 0 has no identity yet.")
    ).toBeVisible();
  },
};

export const NothingCompiled: Story = {
  args: { ...FIXTURE, modules: [], permissions: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No modules in this image.")).toBeVisible();
    await expect(canvas.getByText("No permissions granted.")).toBeVisible();
  },
};

// Renders on the dark surface this package owns. The decorator composes the
// real ThemeProvider, so the story asserts the dark token pair the surface
// actually renders; a dark-surface token regression fails here.
export const Dark: Story = {
  decorators: [
    (Story) => (
      <ThemeProvider theme="dark">
        <Story />
      </ThemeProvider>
    ),
  ],
  play: async ({ canvas }) => {
    const heading = canvas.getByRole("heading", { name: "Deployment" });

    await expect(heading).toBeVisible();

    const surface = heading.closest("[data-theme]");

    await expect(surface).toHaveAttribute("data-theme", "dark");
    await expect(surface).toHaveStyle({
      backgroundColor: themeTokens.dark.surface,
      color: themeTokens.dark.foreground,
    });
    // The dark pair must not collapse to the light one, so a dark token that
    // becomes the light colour (the contrast regression this story catches)
    // fails here rather than passing on the attribute alone.
    await expect(surface).not.toHaveStyle({
      backgroundColor: themeTokens.light.surface,
    });
  },
};
