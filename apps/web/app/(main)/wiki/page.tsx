import { Suspense } from "react";
import WikiWorkspace from "./_components/WikiWorkspace";

/**
 * /wiki — Obsidian-style notes workspace.
 *
 * Server shell only — all live data lives in WikiWorkspace. Suspense boundary
 * is required because nuqs's useQueryState reads search params on the client.
 */
export default function WikiPage() {
  return (
    <Suspense fallback={null}>
      <WikiWorkspace />
    </Suspense>
  );
}
