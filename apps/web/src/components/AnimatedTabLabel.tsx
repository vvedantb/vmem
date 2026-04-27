import { AnimatePresence, motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";

/**
 * Animated label slot for icon-only tab triggers. Renders nothing when
 * `isActive` is false; when it flips true the label slides in (width
 * grows from 0 + fade in) so the active pill expands smoothly instead of
 * snapping. Mirror of the sidebar `NavLink` label animation.
 *
 * Used by all `_components/*Tabs.tsx` shared tab bars.
 */
export function AnimatedTabLabel({
  isActive,
  label,
}: {
  isActive: boolean;
  label: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {isActive ? (
        <motion.span
          key={label}
          className="ml-1.5 overflow-hidden whitespace-nowrap"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "auto", opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: motionDuration.fast, ease: motionEase }}
        >
          {label}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
