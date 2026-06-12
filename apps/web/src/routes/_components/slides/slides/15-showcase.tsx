import { motion } from "motion/react";
import type { ReactNode } from "react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideKicker,
  SlideReveal,
  SlideShell,
} from "../_components/SlideShell";

/**
 * Linear-style 3D product showcase: real app screenshots rendered as tilted
 * panels inside a CSS perspective, flying up from a deep tilt into a layered
 * fan, then idly floating. Screenshots live in /public/slides (captured from
 * the dev app at 1600x1000).
 */

interface ShowcasePanelProps {
  src: string;
  alt: string;
  /** Settled 3D pose. */
  rotateX: number;
  rotateY: number;
  /** Entry delay in seconds. */
  delay: number;
  /** Idle float distance (px) and period (s) — desynced per panel. */
  floatY: number;
  floatDuration: number;
  className?: string;
  children?: ReactNode;
}

function ShowcasePanel({
  src,
  alt,
  rotateX,
  rotateY,
  delay,
  floatY,
  floatDuration,
  className = "",
}: ShowcasePanelProps) {
  return (
    <motion.div
      className={`absolute ${className}`}
      style={{ transformStyle: "preserve-3d" }}
      initial={{ opacity: 0, y: 160, rotateX: rotateX + 28, rotateY }}
      animate={{ opacity: 1, y: 0, rotateX, rotateY }}
      transition={{
        delay,
        type: "spring",
        stiffness: 50,
        damping: 16,
        mass: 1.1,
        opacity: { delay, duration: 0.7 },
      }}
    >
      {/* Inner wrapper carries the endless idle float so it composes with the
          settled 3D pose on the outer element instead of fighting it. */}
      <motion.div
        animate={{ y: [0, -floatY, 0] }}
        transition={{
          duration: floatDuration,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="overflow-hidden rounded-2xl shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]"
      >
        <img src={src} alt={alt} className="block w-full" draggable={false} />
      </motion.div>
    </motion.div>
  );
}

export function Slide15Showcase() {
  return (
    <SlideShell className="!px-16 !py-12">
      <SlideReveal delay={0}>
        <SlideKicker>Showcase</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["The product, today."]} size="xl" />

      {/* Perspective stage for the 3D panels */}
      <div
        className="relative mt-6 flex-1"
        style={{ perspective: 1400, transformStyle: "preserve-3d" }}
      >
        {/* Back-left: dashboard */}
        <ShowcasePanel
          src="/slides/app-home.png"
          alt="vmem dashboard"
          className="left-[-40px] top-[60px] w-[440px]"
          rotateX={6}
          rotateY={18}
          delay={0.5}
          floatY={8}
          floatDuration={7}
        />
        {/* Back-right: memories list */}
        <ShowcasePanel
          src="/slides/app-memories.png"
          alt="vmem memories list"
          className="right-[-40px] top-[90px] w-[440px]"
          rotateX={6}
          rotateY={-18}
          delay={0.7}
          floatY={10}
          floatDuration={8}
        />
        {/* Front-centre hero: memory graph. Positioned with an explicit left
            offset — translate utilities would fight motion's inline transform. */}
        <ShowcasePanel
          src="/slides/app-graph.png"
          alt="vmem memory graph"
          className="left-[256px] top-[0px] z-10 w-[640px]"
          rotateX={10}
          rotateY={0}
          delay={0.25}
          floatY={12}
          floatDuration={6}
        />
      </div>
    </SlideShell>
  );
}
