/**
 * Persona — animated orb that visualises voice-session state.
 *
 * API matches upstream AI Elements `<Persona />` so a future swap
 * to the Rive-based implementation is a single file change.
 *
 * This version uses motion/react CSS animations instead of Rive,
 * keeping the bundle lightweight and avoiding WebGL2 context pressure.
 */

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { cn } from "../utils/cn";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type PersonaState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "asleep";

export type PersonaVariant =
  | "obsidian"
  | "mana"
  | "opal"
  | "halo"
  | "glint"
  | "command";

export interface PersonaProps {
  /** Current animation state. */
  state?: PersonaState;
  /** Visual colour variant. */
  variant?: PersonaVariant;
  /** Extra classes — use to set the orb size (e.g. `size-40`). */
  className?: string;
  /** Fires once when the component has mounted and is ready to animate. */
  onReady?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Variant colour map                                                 */
/* ------------------------------------------------------------------ */

interface VariantColours {
  from: string;
  to: string;
  glow: string;
  ring: string;
}

const VARIANT_COLOURS: Record<PersonaVariant, VariantColours> = {
  obsidian: {
    from: "#1e293b",
    to: "#475569",
    glow: "rgba(148,163,184,0.35)",
    ring: "rgba(148,163,184,0.45)",
  },
  mana: {
    from: "#4f46e5",
    to: "#a855f7",
    glow: "rgba(129,140,248,0.45)",
    ring: "rgba(167,139,250,0.55)",
  },
  opal: {
    from: "#cbd5e1",
    to: "#f8fafc",
    glow: "rgba(203,213,225,0.5)",
    ring: "rgba(203,213,225,0.55)",
  },
  halo: {
    from: "#d97706",
    to: "#fbbf24",
    glow: "rgba(245,158,11,0.45)",
    ring: "rgba(251,191,36,0.55)",
  },
  glint: {
    from: "#0891b2",
    to: "#38bdf8",
    glow: "rgba(6,182,212,0.45)",
    ring: "rgba(56,189,248,0.55)",
  },
  command: {
    from: "#059669",
    to: "#34d399",
    glow: "rgba(16,185,129,0.45)",
    ring: "rgba(52,211,153,0.55)",
  },
};

/* ------------------------------------------------------------------ */
/*  State animation config                                             */
/* ------------------------------------------------------------------ */

interface StateConfig {
  /** Orb scale keyframes */
  scale: number[];
  /** Outer glow scale keyframes */
  glowScale: number[];
  /** Outer glow opacity */
  glowOpacity: number;
  /** Duration of one animation cycle (seconds) */
  duration: number;
  /** Whether the inner shimmer should rotate */
  shimmerRotate: boolean;
}

const STATE_CONFIG: Record<PersonaState, StateConfig> = {
  idle: {
    scale: [1, 1.025, 1],
    glowScale: [1, 1.08, 1],
    glowOpacity: 0.55,
    duration: 3.2,
    shimmerRotate: false,
  },
  listening: {
    scale: [1, 1.06, 1],
    glowScale: [1, 1.22, 1],
    glowOpacity: 0.8,
    duration: 1.2,
    shimmerRotate: false,
  },
  thinking: {
    scale: [1, 1.02, 1],
    glowScale: [1, 1.12, 1],
    glowOpacity: 0.7,
    duration: 1.6,
    shimmerRotate: true,
  },
  speaking: {
    scale: [1, 1.07, 1, 1.035, 1],
    glowScale: [1, 1.28, 1, 1.14, 1],
    glowOpacity: 0.85,
    duration: 0.9,
    shimmerRotate: false,
  },
  asleep: {
    scale: [1, 1.008, 1],
    glowScale: [1, 1.04, 1],
    glowOpacity: 0.3,
    duration: 4.5,
    shimmerRotate: false,
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Animated orb representing the AI persona's current state.
 *
 * Set size via `className` (e.g. `className="size-40"`). The orb fills
 * its container as a circle. Colour is controlled by `variant`, animation
 * by `state`.
 */
export function Persona({
  state = "idle",
  variant = "mana",
  className,
  onReady,
}: PersonaProps) {
  const colours = VARIANT_COLOURS[variant];
  const config = STATE_CONFIG[state];
  const readyFired = useRef(false);

  useEffect(() => {
    if (!readyFired.current) {
      readyFired.current = true;
      onReady?.();
    }
  }, [onReady]);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center size-32",
        className,
      )}
    >
      {/* ---- Outer glow ---- */}
      <motion.div
        className="absolute inset-[-25%] rounded-full blur-2xl pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${colours.glow}, transparent 70%)`,
        }}
        animate={{
          scale: config.glowScale,
          opacity: config.glowOpacity,
        }}
        transition={{
          duration: config.duration,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* ---- Main orb ---- */}
      <motion.div
        className="relative size-full rounded-full shadow-lg overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${colours.from}, ${colours.to})`,
        }}
        animate={{ scale: config.scale }}
        transition={{
          duration: config.duration,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {/* Inner highlight / shimmer */}
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.25), transparent 55%)",
          }}
          animate={
            config.shimmerRotate
              ? { rotate: [0, 360] }
              : { rotate: 0, opacity: state === "asleep" ? 0.4 : 1 }
          }
          transition={
            config.shimmerRotate
              ? { duration: 2.5, repeat: Infinity, ease: "linear" }
              : { duration: 0.6 }
          }
        />
      </motion.div>

      {/* ---- Listening ripple ring ---- */}
      {state === "listening" && (
        <motion.div
          className="absolute inset-[-8%] rounded-full border-2 pointer-events-none"
          style={{ borderColor: colours.ring }}
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 1.18, opacity: 0 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      {/* ---- Speaking pulse rings ---- */}
      {state === "speaking" && (
        <>
          <motion.div
            className="absolute inset-[-10%] rounded-full border pointer-events-none"
            style={{ borderColor: colours.ring }}
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.25, opacity: 0 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
          />
          <motion.div
            className="absolute inset-[-10%] rounded-full border pointer-events-none"
            style={{ borderColor: colours.ring }}
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.25, opacity: 0 }}
            transition={{
              duration: 1.1,
              repeat: Infinity,
              ease: "easeOut",
              delay: 0.35,
            }}
          />
        </>
      )}
    </div>
  );
}
