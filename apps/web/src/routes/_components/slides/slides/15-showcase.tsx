import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideKicker,
  SlideReveal,
  SlideShell,
} from "../_components/SlideShell";

/**
 * Linear-style 3D product showcase + slideshow: real app screenshots rendered
 * as tilted panels inside a CSS perspective. Every few seconds the three
 * panels rotate through the three poses (front-centre hero, back-left,
 * back-right), springing between them. Screenshots live in /public/slides.
 */

const ROTATE_INTERVAL_MS = 3500;

/** The three 3D poses panels cycle through. x/width animate via spring. */
const POSES = [
  // Front-centre hero
  { x: 256, y: 0, rotateX: 10, rotateY: 0, width: 640, zIndex: 10, opacity: 1 },
  // Back-left
  {
    x: -40,
    y: 60,
    rotateX: 6,
    rotateY: 18,
    width: 440,
    zIndex: 1,
    opacity: 0.85,
  },
  // Back-right
  {
    x: 752,
    y: 90,
    rotateX: 6,
    rotateY: -18,
    width: 440,
    zIndex: 1,
    opacity: 0.85,
  },
] as const;

const PANELS = [
  { src: "/slides/app-graph.png", label: "Memory graph" },
  { src: "/slides/app-home.png", label: "Dashboard" },
  { src: "/slides/app-memories.png", label: "Memories" },
] as const;

interface ShowcasePanelProps {
  src: string;
  label: string;
  pose: (typeof POSES)[number];
  /** Entry delay in seconds (first mount only). */
  delay: number;
  /** Idle float distance (px) and period (s) — desynced per panel. */
  floatY: number;
  floatDuration: number;
}

function ShowcasePanel({
  src,
  label,
  pose,
  delay,
  floatY,
  floatDuration,
}: ShowcasePanelProps) {
  return (
    <motion.div
      className="absolute left-0 top-0"
      style={{ transformStyle: "preserve-3d", zIndex: pose.zIndex }}
      initial={{
        opacity: 0,
        x: pose.x,
        y: pose.y + 160,
        rotateX: pose.rotateX + 28,
        rotateY: pose.rotateY,
        width: pose.width,
      }}
      animate={{
        opacity: pose.opacity,
        x: pose.x,
        y: pose.y,
        rotateX: pose.rotateX,
        rotateY: pose.rotateY,
        width: pose.width,
      }}
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
      >
        <div className="overflow-hidden rounded-2xl shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]">
          <img
            src={src}
            alt={label}
            className="block w-full"
            draggable={false}
          />
        </div>
        <p className="mt-3 text-center text-sm text-muted">{label}</p>
      </motion.div>
    </motion.div>
  );
}

export function Slide15Showcase() {
  // Slideshow offset: panel i occupies pose (i + offset) % 3. Ticks forward
  // every ROTATE_INTERVAL_MS after the entry animation has settled.
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setOffset((current) => (current + 1) % POSES.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

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
        {PANELS.map((panel, i) => (
          <ShowcasePanel
            key={panel.src}
            src={panel.src}
            label={panel.label}
            pose={POSES[(i + offset) % POSES.length]}
            delay={0.25 + i * 0.25}
            floatY={8 + i * 2}
            floatDuration={6 + i}
          />
        ))}
      </div>
    </SlideShell>
  );
}
