import { useContext } from "react";
import { motion } from "motion/react";
import type { Variants } from "motion/react";
import { motionEase } from "@vmem/ui";
import { SlideStepContext } from "./SlideShell";

/**
 * Per-word entrance: each word fades up from a blurred state, staggered
 * ~70 ms apart. Mirrors SlideReveal step-gating semantics — the entire title
 * stays hidden until `contextStep >= step`, then animates in from the first
 * word to the last.
 */
const wordVariants: Variants = {
  hidden: { opacity: 0, y: 8, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.45, ease: motionEase },
  },
};

interface BlurWordsTitleProps {
  /**
   * Each string is a visual line of the heading. Words within each line are
   * staggered together; a `<br>` separates lines so the stagger continues
   * uninterrupted across them.
   */
  lines: string[];
  /** Matches SlideTitle size options. xl=text-5xl, 2xl=text-6xl, 3xl=text-7xl, 4xl=text-8xl */
  size?: "xl" | "2xl" | "3xl" | "4xl";
  /** Build step at which this title animates in. 0 = on slide entry (default). */
  step?: number;
  /** Seconds before the first word begins (cascades naturally from slide entry). */
  delay?: number;
}

/**
 * Slide title with a per-word blur reveal. Drop-in replacement for SlideTitle
 * when blur-word entrance is desired.
 */
export function BlurWordsTitle({
  lines,
  size = "2xl",
  step = 0,
  delay = 0,
}: BlurWordsTitleProps) {
  const contextStep = useContext(SlideStepContext);
  const isVisible = contextStep >= step;

  const sizeClass =
    size === "xl"
      ? "text-5xl"
      : size === "2xl"
        ? "text-6xl"
        : size === "3xl"
          ? "text-7xl"
          : "text-8xl";

  // Container drives the cross-word stagger. Defined here because
  // `delayChildren` depends on the `delay` prop.
  const containerVariants: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: 0.12,
        delayChildren: delay,
      },
    },
  };

  return (
    <motion.h1
      className={`font-instrumentSerif ${sizeClass} font-normal leading-tight tracking-tight text-foreground`}
      variants={containerVariants}
      initial={isVisible ? "show" : "hidden"}
      animate={isVisible ? "show" : "hidden"}
    >
      {lines.flatMap((line, lineIdx) => {
        const words = line.split(" ").filter(Boolean);
        const wordSpans = words.map((word, wordIdx) => (
          <motion.span
            key={`${lineIdx}-${wordIdx}`}
            variants={wordVariants}
            className="inline-block"
            style={{ marginRight: "0.22em" }}
          >
            {word}
          </motion.span>
        ));
        // Insert a <br> after each line except the last so the stagger
        // continues seamlessly across the line break.
        if (lineIdx < lines.length - 1) {
          return [...wordSpans, <br key={`br-${lineIdx}`} />];
        }
        return wordSpans;
      })}
    </motion.h1>
  );
}
