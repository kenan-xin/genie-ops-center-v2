import { createElement } from "react";

export type NotSetUpPageProps = {
  readonly steps: readonly {
    readonly step: string;
    readonly state: "pending" | "done" | "failed";
    readonly detail: string | null;
  }[];
};

/**
 * The neutral setup-progress page (R-16, R-17). It renders on every route while the setup gate is
 * unsatisfied. It has no application shell, no tenant branding, and no visitor action, because the
 * shell and the branding are exactly what setup has not produced yet. It lists only the steps the
 * running image knows, each with its state and, for a failed step, the cause the setup run
 * recorded.
 *
 * It is authored with `createElement` rather than JSX on purpose: the app's `tsconfig` keeps
 * `jsx: "preserve"` for Next, and the unit test runner compiles this module with esbuild, which
 * cannot parse preserved JSX. The story and the app render it through the Next build, where either
 * spelling works.
 */
export function NotSetUpPage({ steps }: NotSetUpPageProps) {
  return createElement(
    "main",
    {
      className:
        "mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6",
    },
    createElement(
      "h1",
      { className: "text-2xl font-semibold" },
      "This deployment is not set up yet"
    ),
    createElement(
      "p",
      null,
      "An operator must finish genie-ops setup before anyone can sign in."
    ),
    createElement(
      "ul",
      { "aria-label": "Setup steps", "className": "flex flex-col gap-3" },
      steps.map(({ step, state, detail }) =>
        createElement(
          "li",
          { key: step, className: "rounded-md border px-4 py-3" },
          createElement(
            "div",
            { className: "flex items-center justify-between gap-3" },
            createElement("span", { className: "font-mono text-sm" }, step),
            createElement("span", { className: "text-sm" }, state)
          ),
          detail === null
            ? null
            : createElement("p", { className: "mt-1 text-sm" }, detail)
        )
      )
    )
  );
}
