import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback } from "react";
import { SlideDeck } from "./_components/slides/SlideDeck";

const searchSchema = z.object({
  slide: z.number().int().min(1).optional().default(1),
});

export const Route = createFileRoute("/slides")({
  validateSearch: searchSchema,
  // Internal team presentation — only available in local dev, never deployed.
  // beforeLoad: () => {
  //   if (!import.meta.env.DEV) {
  //     throw notFound();
  //   }
  // },
  component: SlidesPage,
});

function SlidesPage() {
  const { slide } = Route.useSearch();
  const navigate = useNavigate({ from: "/slides" });

  const handleNavigate = useCallback(
    (next: number) => {
      void navigate({ search: { slide: next }, replace: true });
    },
    [navigate],
  );

  return <SlideDeck slide={slide} onNavigate={handleNavigate} />;
}
