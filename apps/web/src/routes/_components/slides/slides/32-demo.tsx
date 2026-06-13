import { motion } from "motion/react";
import {
  SlideKicker,
  SlideReveal,
  SlideShell,
} from "../_components/SlideShell";

/**
 * Device-mockup-zoom demo (remocn-inspired, pure motion/react): the real
 * graph screenshot sits inside a laptop frame and slowly pushes in and pans
 * across the canvas (Ken Burns), looping, so it reads as a live product demo.
 */

export function Slide32Demo() {
  return (
    <SlideShell center className="!py-10">
      <SlideReveal delay={0}>
        <SlideKicker>Live demo</SlideKicker>
      </SlideReveal>

      {/* Laptop mockup — springs in, then the screen content Ken-Burns loops */}
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
          <div className="aspect-[8/5] overflow-hidden rounded-[6px] bg-black">
            <motion.img
              src="/slides/app-graph.png"
              alt="vmem memory graph"
              className="h-full w-full origin-center object-cover"
              draggable={false}
              animate={{
                scale: [1, 1.22, 1.22, 1],
                x: ["0%", "-6%", "6%", "0%"],
                y: ["0%", "4%", "-3%", "0%"],
              }}
              transition={{
                duration: 16,
                times: [0, 0.4, 0.7, 1],
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
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
