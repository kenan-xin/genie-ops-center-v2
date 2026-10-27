import { Skeleton } from "@genie/ui";

export type PageSkeletonProps = { readonly label: string };

const ROWS = ["1", "2", "3", "4", "5", "6"];

// The design system keeps heights off a shadcn part, so a sized flex row stretches the block.
function Block(props: { readonly className: string }) {
  return (
    <div className={`flex ${props.className}`}>
      <Skeleton className="flex-1" />
    </div>
  );
}

/**
 * The content of a shell page that is still rendering (Spec 3 R-25, NAV-1). The blocks take the
 * shape of the `PageHeader` title and description and of 44px table rows. The `main` is busy, so a
 * focus rule waits for the page that replaces it.
 */
export function PageSkeleton(props: PageSkeletonProps) {
  return (
    <main aria-busy="true">
      <div role="status" className="flex flex-col gap-6">
        <span className="sr-only">{props.label}</span>
        {/* Below lg the top bar holds the title, as in PageHeader. */}
        <div
          data-page-skeleton-header=""
          aria-hidden="true"
          className="hidden flex-col gap-1 lg:flex"
        >
          <Block className="h-7 w-48" />
          <Block className="h-5 w-72 max-w-full" />
        </div>
        <div aria-hidden="true" className="flex flex-col gap-2">
          {ROWS.map((row) => (
            <Block key={row} className="h-11" />
          ))}
        </div>
      </div>
    </main>
  );
}
