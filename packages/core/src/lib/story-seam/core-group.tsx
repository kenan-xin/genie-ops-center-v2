/**
 * The browser-safe seam that proves the Core group renders in Storybook.
 *
 * It is a fixture, not a feature. Section 1 replaces it with the first real core
 * screen. It holds no data access, no registry import, and no environment read,
 * so the host can render it without a database or an identity provider.
 */
export type CoreGroupProps = {
  readonly heading: string;
  readonly body: string;
};

export function CoreGroup(props: CoreGroupProps) {
  return (
    <section aria-labelledby="core-group-heading">
      <h2 id="core-group-heading">{props.heading}</h2>
      <p>{props.body}</p>
    </section>
  );
}
