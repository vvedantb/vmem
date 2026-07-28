// AI-generated (Claude), prompt: "self drawing notification icons for toast types"
// Modified by me: type colors and path timing
// animated notification icons with self-drawing effects

import { motion } from "motion/react";
import type { NotificationType } from "@/contexts/NotificationContext";

interface AnimatedNotificationIconProps {
  type: NotificationType;
  size?: number;
  className?: string;
}

const TYPE_COLORS: Record<NotificationType, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  error: "var(--danger)",
  info: "var(--info)",
};

function SuccessIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {
        // circle background
      }
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
      {
        // checkmark, draws itself
      }
      <motion.path
        d="M8 12l2.5 2.5L16 9"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.3, ease: "easeOut" }}
      />
    </svg>
  );
}

function WarningIcon({ size, color }: { size: number; color: string }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      initial={{ rotate: 0 }}
      animate={{ rotate: [0, -5, 5, -3, 3, 0] }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      {
        // triangle
      }
      <motion.path
        d="M12 2L2 20h20L12 2z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
      {
        // exclamation line
      }
      <motion.path
        d="M12 9v4"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, delay: 0.3 }}
      />
      {
        // exclamation dot
      }
      <motion.circle
        cx="12"
        cy="17"
        r="1"
        fill={color}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.15, delay: 0.45, type: "spring" }}
      />
    </motion.svg>
  );
}

function ErrorIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {
        // circle with pulse
      }
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
      {
        // x mark, first line
      }
      <motion.path
        d="M15 9l-6 6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, delay: 0.2 }}
      />
      {
        // x mark, second line
      }
      <motion.path
        d="M9 9l6 6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, delay: 0.3 }}
      />
    </svg>
  );
}

function InfoIcon({ size, color }: { size: number; color: string }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      initial={{ y: 2, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {
        // circle
      }
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
      {
        // info dot
      }
      <motion.circle
        cx="12"
        cy="8"
        r="1"
        fill={color}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.2, delay: 0.2, type: "spring" }}
      />
      {
        // info line
      }
      <motion.path
        d="M12 12v4"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, delay: 0.3 }}
      />
    </motion.svg>
  );
}

export function AnimatedNotificationIcon({
  type,
  size = 20,
  className,
}: AnimatedNotificationIconProps) {
  const color = TYPE_COLORS[type];

  return (
    <div className={className}>
      {type === "success" && <SuccessIcon size={size} color={color} />}
      {type === "warning" && <WarningIcon size={size} color={color} />}
      {type === "error" && <ErrorIcon size={size} color={color} />}
      {type === "info" && <InfoIcon size={size} color={color} />}
    </div>
  );
}
