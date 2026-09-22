import { ThemeProvider, type ThemeName } from "@genie/ui";
import type { Preview } from "@storybook/nextjs-vite";

const preview: Preview = {
  parameters: {
    // Violations fail the component test in the user interface and on the
    // command line. "todo" only warns, and this gate must not warn.
    a11y: { test: "error" },
    docs: { toc: true },
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
