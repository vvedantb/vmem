import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import VoiceClient from "@/components/voice/VoiceClient";

export const Route = createFileRoute("/_main/$profileId/voice")({
  component: VoicePage,
});

function VoicePage() {
  return (
    <motion.div
      className="flex h-full min-h-0 flex-col overflow-hidden p-3 md:p-4"
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
