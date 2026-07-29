// AI-generated (Claude), prompt: "spring based counter that counts up when in view"
// Modified by me: duration and format value support
// animated counter that counts up from 0 to target value

import { motion, useSpring, useTransform, useInView } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@vmem/ui";

interface AnimatedCounterProps {
  // target value to count up to
  value: number;
  // duration of the animation in seconds
  duration?: number;
  // CSS class for styling
  className?: string;
  // format function for the displayed number
  formatValue?: (value: number) => string;
  // whether to animate on scroll into view
  animateOnView?: boolean;
}

export function AnimatedCounter({
  value,
  duration = 1,
  className,
  formatValue = (v) => Math.round(v).toLocaleString(),
  animateOnView = true,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const springValue = useSpring(0, {
    stiffness: 100 / duration,
    damping: 30,
    restDelta: 0.01,
  });

  const displayValue = useTransform(springValue, (v) => formatValue(v));

  useEffect(() => {
    if (!animateOnView || isInView) {
      springValue.set(value);
    }
  }, [value, springValue, animateOnView, isInView]);

  return (
    <motion.span ref={ref} className={cn("tabular-nums", className)}>
      {displayValue}
    </motion.span>
  );
}
