import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NotSetUpPage } from "./not-set-up-page.tsx";

describe("NotSetUpPage", () => {
  it("shows neutral setup progress without the application shell or visitor actions", () => {
    const html = renderToStaticMarkup(
      createElement(NotSetUpPage, {
        steps: [
          { step: "migrations", state: "done", detail: null },
          { step: "seed", state: "failed", detail: "Seed failed safely." },
        ],
      })
    );

    expect(html).toContain("This deployment is not set up yet");
    expect(html).toContain(
      "An operator must finish genie-ops setup before anyone can sign in."
    );
    expect(html).toContain("migrations");
    expect(html).toContain("done");
    expect(html).toContain("seed");
    expect(html).toContain("failed");
    expect(html).toContain("Seed failed safely.");
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
  });
});
