import { useContext } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStepContext,
} from "../_components/SlideShell";

/**
 * Makes the "company brain" (previous slide) concrete — and, importantly, gets
 * the model right: each person has their OWN private web of memories, and those
 * webs plug into one shared brain. Memories are never shared person-to-person;
 * only the central brain is shared. This keeps faith with the "personal
 * memories stay private" promise. All mock data.
 *
 * Build steps (auto-played by the deck):
 *   step 1 — each person appears with their own little web of private memories
 *   step 2 — the shared brain appears in the middle
 *   step 3 — every person's web connects into that shared brain
 */

const HUB = { l: 50, t: 51 };

interface Dot {
  l: number;
  t: number;
}

interface Person {
  l: number;
  t: number;
  name: string;
  role: string;
  initial: string;
  /** This person's own private memories — a small cluster beside them. */
  dots: [Dot, Dot, Dot];
}

const PEOPLE: Person[] = [
  {
    l: 18,
    t: 24,
    name: "Maya",
    role: "Sales",
    initial: "M",
    dots: [
      { l: 6, t: 13 },
      { l: 26, t: 9 },
      { l: 5, t: 37 },
    ],
  },
  {
    l: 82,
    t: 24,
    name: "Sofia",
    role: "Product",
    initial: "S",
    dots: [
      { l: 94, t: 13 },
      { l: 74, t: 9 },
      { l: 95, t: 37 },
    ],
  },
  {
    l: 18,
    t: 80,
    name: "Tom",
    role: "Support",
    initial: "T",
    dots: [
      { l: 6, t: 91 },
      { l: 26, t: 95 },
      { l: 5, t: 67 },
    ],
  },
  {
    l: 82,
    t: 80,
    name: "Ravi",
    role: "Engineering",
    initial: "R",
    dots: [
      { l: 94, t: 91 },
      { l: 74, t: 95 },
      { l: 95, t: 67 },
    ],
  },
];

/** Absolutely positioned at a percentage point, centred on it. */
function At({ l, t, children }: { l: number; t: number; children: ReactNode }) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${l}%`, top: `${t}%` }}
    >
      {children}
    </div>
  );
}

export function Slide42SharedBrain() {
  const step = useContext(SlideStepContext);
  const peopleVisible = step >= 1;
  const hubVisible = step >= 2;
  const linkedVisible = step >= 3;

  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>The company brain, made real</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle
        lines={["Every person,", "one shared brain."]}
        size="xl"
      />

      <div className="relative mt-2 min-h-0 flex-1">
        {/* Edge layer — percentage coordinate space, crisp strokes. */}
        <svg
          className="absolute inset-0 h-full w-full text-foreground/30"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          {/* Each person's own private web — person to their own memories */}
          {PEOPLE.map((p) =>
            p.dots.map((d, di) => (
              <motion.line
                key={`web-${p.name}-${di}`}
                x1={p.l}
                y1={p.t}
                stroke="currentColor"
                strokeWidth={1.1}
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={{
                  x2: peopleVisible ? d.l : p.l,
                  y2: peopleVisible ? d.t : p.t,
                  opacity: peopleVisible ? 1 : 0,
                }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            )),
          )}

          {/* Each person's web plugs into the shared brain */}
          {PEOPLE.map((p) => (
            <motion.line
              key={`hub-${p.name}`}
              x1={p.l}
              y1={p.t}
              stroke="currentColor"
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
              initial={false}
              animate={{
                x2: linkedVisible ? HUB.l : p.l,
                y2: linkedVisible ? HUB.t : p.t,
                opacity: linkedVisible ? 0.6 : 0,
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          ))}
        </svg>

        {/* Private memory dots — each belongs to one person */}
        {PEOPLE.map((p) =>
          p.dots.map((d, di) => (
            <At key={`dot-${p.name}-${di}`} l={d.l} t={d.t}>
              <motion.span
                className="block rounded-full bg-foreground"
                style={{ width: 8, height: 8 }}
                initial={false}
                animate={{
                  opacity: peopleVisible ? 0.45 : 0,
                  scale: peopleVisible ? 1 : 0.4,
                }}
                transition={{
                  duration: 0.4,
                  delay: peopleVisible ? 0.15 + di * 0.05 : 0,
                  ease: "easeOut",
                }}
              />
            </At>
          )),
        )}

        {/* Central shared brain */}
        <At l={HUB.l} t={HUB.t}>
          <motion.div
            initial={false}
            animate={{
              opacity: hubVisible ? 1 : 0,
              scale: hubVisible ? 1 : 0.6,
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-4 py-2 text-background"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-background" />
            <span className="text-base font-medium">One shared brain</span>
          </motion.div>
        </At>

        {/* People */}
        {PEOPLE.map((p) => (
          <At key={p.name} l={p.l} t={p.t}>
            <motion.div
              initial={false}
              animate={{
                opacity: peopleVisible ? 1 : 0,
                scale: peopleVisible ? 1 : 0.6,
              }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-surface-secondary px-3 py-1.5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-medium text-foreground">
                {p.initial}
              </span>
              <span className="text-left leading-tight">
                <span className="block text-sm font-medium text-foreground">
                  {p.name}
                </span>
                <span className="block text-[11px] text-muted">{p.role}</span>
              </span>
            </motion.div>
          </At>
        ))}
      </div>

      <SlideReveal step={3} className="mt-2 max-w-3xl">
        <p className="text-sm leading-relaxed text-muted">
          Your own memories stay{" "}
          <span className="font-medium text-foreground">private</span> —
          it&rsquo;s only what you share that feeds the one brain the whole
          team, and every AI, can think inside.
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
