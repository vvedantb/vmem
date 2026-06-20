import { motion } from "motion/react";
import type { Variants } from "motion/react";
import { motionEase } from "@vmem/ui";
import { VmemBrand } from "@/components/VmemBrand";
import { SlideAmbientGraph } from "../_components/SlideAmbientGraph";
import { SlideReveal, SlideShell } from "../_components/SlideShell";

const TITLE = "Questions";

// Each letter blurs up into place, staggered. Mirrors BlurWordsTitle but
// per-character so the closing word assembles letter by letter.
const letterVariants: Variants = {
  hidden: { opacity: 0, y: 10, filter: "blur(10px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: motionEase },
  },
};

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
};

export function Slide14Questions() {
  return (
    <SlideShell center>
      {/* Graph lines around the edges, fading out behind the centred word.
          animateDraw = the connectors draw themselves in on slide load. */}
      <SlideAmbientGraph
        animateDraw
        className="[-webkit-mask-image:radial-gradient(ellipse_58%_54%_at_50%_50%,transparent_34%,black_72%)] [mask-image:radial-gradient(ellipse_58%_54%_at_50%_50%,transparent_34%,black_72%)]"
      />
      {/* Outer wrapper flashes twice every 3s once the word has assembled. */}
      <motion.div
        animate={{ opacity: [1, 0.2, 1, 0.2, 1, 1] }}
        transition={{
          duration: 3,
          // two quick blinks spaced out, then steady for the rest of the cycle
          times: [0, 0.1, 0.2, 0.3, 0.4, 1],
          repeat: Infinity,
          repeatDelay: 0,
          delay: 1.5,
          ease: "easeInOut",
        }}
      >
        <motion.h1
          className="font-instrumentSerif text-8xl font-normal leading-tight tracking-tight text-foreground"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {TITLE.split("").map((char, i) => (
            <motion.span
              key={`${char}-${i}`}
              variants={letterVariants}
              className="inline-block"
            >
              {char}
            </motion.span>
          ))}
        </motion.h1>
      </motion.div>
      <SlideReveal delay={0.5} className="mt-10">
        <VmemBrand iconSize={28} textClassName="text-2xl" />
      </SlideReveal>
    </SlideShell>
  );
}
