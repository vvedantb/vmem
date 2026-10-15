import { createFileRoute } from "@tanstack/react-router";

// deck moved out of this repo. vercel.json redirects in prod; this covers dev
const SLIDES_URL = "https://openwork.vedantb.com/slides/intro-to-vmem";

export const Route = createFileRoute("/slides")({
  beforeLoad: () => {
    window.location.replace(SLIDES_URL);
  },
  component: () => null,
});
