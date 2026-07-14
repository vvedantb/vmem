import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

const PlaygroundClient = lazy(
  () => import("@/components/settings/PlaygroundClient"),
);

export const Route = createFileRoute("/_main/settings/playground/")({
  component: PlaygroundPage,
});

function PlaygroundPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
        </div>
      }
    >
      <PlaygroundClient />
    </Suspense>
  );
}
