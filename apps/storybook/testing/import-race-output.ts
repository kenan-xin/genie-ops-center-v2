/**
 * The real nested `test-storybook` output of develop run 35871795291, cut to the
 * lines the import-race predicate reads. Four files imported the addon's setup
 * file from the same server; only the first file's import failed, and no test
 * failed. Both the predicate's own tests and the wrapper's retry tests read it,
 * so the real CI output is the fixture rather than a paraphrase.
 */
export const RACE_OUTPUT = ` RUN  v4.1.11 /tmp/genie-storybook-matrix-XliQDe/apps/storybook

 ❯  storybook (chromium)  ../../packages/ui/src/disclosure/disclosure.stories.tsx (0 test)
 ✓  storybook (chromium)  ../../packages/ui/src/theme/theme-provider.stories.tsx (2 tests) 261ms

 Test Files  1 failed | 4 passed (5)
      Tests  9 passed (9)

 FAIL   storybook (chromium)  ../../packages/ui/src/disclosure/disclosure.stories.tsx [ ../../packages/ui/src/disclosure/disclosure.stories.tsx ]
Error: Failed to import test file /tmp/genie-storybook-matrix-XliQDe/node_modules/.pnpm/@storybook+addon-vitest@10.6.0/node_modules/@storybook/addon-vitest/dist/vitest-plugin/setup-file-with-project-annotations.js
Caused by: TypeError: Failed to fetch dynamically imported module: http://localhost:63315/tmp/genie-storybook-matrix-XliQDe/node_modules/.pnpm/@storybook+addon-vitest@10.6.0/node_modules/@storybook/addon-vitest/dist/vitest-plugin/setup-file-with-project-annotations.js?import&browserv=1790173057537
`;

/** The same import failure beside a story that really failed. */
export const RACE_AND_FAILED_STORY = RACE_OUTPUT.replace(
  "Tests  9 passed (9)",
  "Tests  1 failed | 8 passed (9)"
);

export const FAILED_STORY = ` Test Files  1 failed | 5 passed (6)
      Tests  1 failed | 15 passed (16)

 FAIL  |storybook (chromium)| ../../packages/ui/src/__matrix__/broken.stories.tsx > Interaction Fails
TestingLibraryElementError: Unable to find an element with the text: this text is not rendered.
`;
