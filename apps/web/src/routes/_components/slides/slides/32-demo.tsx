import { motion } from "motion/react";
import { SlideMemoryPreview } from "../_components/SlideMemoryPreview";
import {
  SlideKicker,
  SlideReveal,
  SlideShell,
} from "../_components/SlideShell";

/**
 * Live demo: the real interactive memory-graph preview sits inside a laptop
 * frame. Nodes are clickable (they carry role="button", so the deck's
 * click-to-advance ignores them) — recall surfaces live as you click during
 * the talk, with the typewriter recall line and node counter running.
 */

export function Slide32Demo() {
  return (
    <SlideShell center className="!py-10">
      <SlideReveal delay={0}>
        <SlideKicker>Live demo</SlideKicker>
      </SlideReveal>

      {/* Laptop mockup — springs in, then the live preview runs on screen */}
      <motion.div
        className="mt-5 flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 60, damping: 16, mass: 1 }}
      >
        {/* Screen + bezel */}
        <div className="relative w-[680px] rounded-[14px] bg-neutral-800 p-2.5 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)]">
          {/* Camera notch */}
          <div className="absolute left-1/2 top-1 h-1 w-10 -translate-x-1/2 rounded-full bg-neutral-700" />
          <div className="overflow-hidden rounded-[6px] bg-surface">
            {/* Live, clickable graph preview — the actual product mock */}
            <SlideMemoryPreview />
          </div>
        </div>
        {/* Laptop base / hinge */}
        <div className="relative h-3 w-[760px] rounded-b-[10px] bg-gradient-to-b from-neutral-700 to-neutral-800">
          <div className="absolute left-1/2 top-0 h-1 w-20 -translate-x-1/2 rounded-b-md bg-neutral-600" />
        </div>
      </motion.div>

      <SlideReveal delay={0.3} className="mt-5">
        <p className="text-sm text-muted">
          Every node a memory — click one and recall surfaces what connects.
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
