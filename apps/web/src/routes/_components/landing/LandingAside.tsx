"use client";

import { motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import { LandingFeatureCard, type LandingFeature } from "./LandingFeatureCard";
import { LandingMemoryPreview } from "./LandingMemoryPreview";

interface LandingAsideProps {
  features: readonly LandingFeature[];
}

export function LandingAside({ features }: LandingAsideProps) {
  return (
    <motion.div
      className="flex w-full min-w-0 flex-col gap-5 sm:gap-6 lg:sticky lg:top-10 lg:pt-2"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: motionDuration.slow,
        ease: motionEase,
        delay: 0.34,
      }}
    >
      <LandingMemoryPreview />

      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted">
          Why vmem
        </p>
        <div className="flex flex-col gap-2.5">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: motionDuration.base,
                ease: motionEase,
                delay: 0.42 + index * 0.07,
              }}
            >
              <LandingFeatureCard {...feature} index={index} />
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
