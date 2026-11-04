"use client";

import { Skeleton } from "@genie/ui";
import { lazy, Suspense, useSyncExternalStore, type ReactNode } from "react";

import type { DocumentViewerProps } from "./document-viewer.tsx";

// react-pdf stays out of the module client's main bundle (decision 1).
const DocumentViewer = lazy(() =>
  import("./document-viewer.tsx").then((module) => ({
    default: module.DocumentViewer,
  }))
);

const subscribeToNothing = () => () => {};

const inBrowser = () => true;

const onServer = () => false;

function PageSkeleton() {
  return <Skeleton aria-hidden className="aspect-3/4 w-full" />;
}

/**
 * The one way a page shows a document: `DocumentViewer`, loaded on demand and only in the
 * browser, so the server draws a page-shaped placeholder and react-pdf never reaches the server.
 */
export function LazyDocumentViewer(props: DocumentViewerProps): ReactNode {
  const browser = useSyncExternalStore(subscribeToNothing, inBrowser, onServer);

  if (!browser) return <PageSkeleton />;

  return (
    <Suspense fallback={<PageSkeleton />}>
      <DocumentViewer {...props} />
    </Suspense>
  );
}
