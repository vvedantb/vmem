"use client";

import { motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import VoiceClient from "./VoiceClient";

export default function VoicePage() {
  return (
    <motion.div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: motionDuration.base,
        ease: motionEase,
      }}
    >
      <VoiceClient />
    </motion.div>
  );
}
