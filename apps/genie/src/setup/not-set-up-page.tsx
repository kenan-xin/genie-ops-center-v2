import { createElement } from "react";

export type NotSetUpPageProps = {
  readonly steps: readonly {
    readonly step: string;
    readonly state: "pending" | "done" | "failed";
    readonly detail: string | null;
  }[];
};

/** Minimal renderable scaffold so the component story and behavior assertions fail meaningfully. */
export function NotSetUpPage(_props: NotSetUpPageProps) {
  return createElement(
    "main",
    null,
    createElement("h1", null, "Setup required")
  );
}
