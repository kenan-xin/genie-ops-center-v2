import { ThemeProvider, type ThemeName } from "@genie/ui";
import type { Preview } from "@storybook/nextjs-vite";

import { waitForClosingPopups } from "./closing-popups.ts";

import "./preview.css";

const preview: Preview = {
  parameters: {
    // Violations fail the component test in the user interface and on the
    // command line. "todo" only warns, and this gate must not warn.
    a11y: { test: "error" },
    docs: { toc: true },
    // The phone viewport of DEC-25, for the list stories.
    viewport: {
      options: {
        phone390: {
          name: "Phone 390",
          styles: { width: "390px", height: "844px" },
          type: "mobile",
        },
        phone844x390: {
          name: "Phone 844 x 390 (rotated)",
          styles: { width: "844px", height: "390px" },
          type: "mobile",
        },
        desktop1440: {
          name: "Desktop 1440",
          styles: { width: "1440px", height: "900px" },
          type: "desktop",
        },
        desktop1920: {
          name: "Desktop 1920 x 1080",
          styles: { width: "1920px", height: "1080px" },
          type: "desktop",
        },
      },
    },
  },
  initialGlobals: {
    theme: "light",
  },
  globalTypes: {
    theme: {
      description: "The colour scheme the story renders in.",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  // Storybook runs afterEach hooks in reverse, so this runs before the a11y addon's axe check.
  afterEach: [waitForClosingPopups],
  decorators: [
    (Story, context) => (
      // SAFETY: the theme globalType declares exactly the two ThemeName values
      // above, so the toolbar cannot supply anything else.
      <ThemeProvider theme={context.globals.theme as ThemeName}>
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default preview;
