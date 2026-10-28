import { ThemeProvider, type ThemeName } from "@genie/ui";
import type { Preview } from "@storybook/nextjs-vite";

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
