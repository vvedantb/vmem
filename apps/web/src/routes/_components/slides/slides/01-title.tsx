import { LandingAmbientGraph } from "@/routes/_components/landing/LandingAmbientGraph";
import {
  SlideShell,
  SlideKicker,
  SlideTitle,
  SlideBody,
} from "../_components/SlideShell";

export function Slide01Title() {
  return (
    <SlideShell center>
      <LandingAmbientGraph />
      <div className="relative z-10 flex flex-col items-center text-center">
        <SlideKicker>vmem</SlideKicker>
        <SlideTitle size="3xl">
          A memory layer
          <br />
          for your AI tools.
        </SlideTitle>
        <div className="mt-6 max-w-xl">
          <SlideBody>
            One shared memory store for Claude, agents, extensions, and mobile —
            graph-native, queryable, and alive between sessions.
          </SlideBody>
        </div>
      </div>
    </SlideShell>
  );
}
