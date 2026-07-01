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
 * Makes the "company brain" (previous slide) concrete: mock teammates each
 * connect to the SHARED knowledge they touch — an account, a roadmap, a
 * decision, the wiki — and those in turn feed one central brain. Deliberately
 * shows *shared* knowledge, not private personal memories, to stay true to the
 * "personal memories stay private" promise. All mock data.
 *
 * Build steps (auto-played by the deck):
 *   step 1 — people appear around the ring, plus the central brain
 *   step 2 — the shared-knowledge nodes appear and link into the brain
 *   step 3 — each person links to the shared knowledge they touch; overlaps
 *            (two people on one node) make the "shared" point land
 */

const HUB = { l: 50, t: 51 };

interface Person {
  l: number;
  t: number;
  name: string;
  role: string;
  initial: string;
}

const PEOPLE: Person[] = [
  { l: 17, t: 20, name: "Maya", role: "Sales", initial: "M" },
  { l: 83, t: 20, name: "Sofia", role: "Product", initial: "S" },
  { l: 17, t: 82, name: "Tom", role: "Support", initial: "T" },
  { l: 83, t: 82, name: "Ravi", role: "Engineering", initial: "R" },
];

interface Shared {
  l: number;
  t: number;
  label: string;
  /** Indices into PEOPLE that both touch this piece of shared knowledge. */
  people: [number, number];
}

const SHARED: Shared[] = [
  { l: 50, t: 22, label: "Acme account", people: [0, 1] },
  { l: 79, t: 51, label: "Q3 roadmap", people: [1, 3] },
  { l: 50, t: 80, label: "Pricing decision", people: [2, 3] },
  { l: 21, t: 51, label: "Onboarding wiki", people: [0, 2] },
];

// Flatten the person -> shared-knowledge links for the edge layer.
const PERSON_LINKS = SHARED.flatMap((s, si) =>
  s.people.map((pi) => ({ pi, si })),
);

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
  const sharedVisible = step >= 2;
  const linksVisible = step >= 3;

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
          {/* Shared knowledge -> central brain */}
          {SHARED.map((s) => (
            <motion.line
              key={`hub-${s.label}`}
              x1={s.l}
              y1={s.t}
              stroke="currentColor"
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
              initial={false}
              animate={{
                x2: sharedVisible ? HUB.l : s.l,
                y2: sharedVisible ? HUB.t : s.t,
                opacity: sharedVisible ? 1 : 0,
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          ))}

          {/* People -> the shared knowledge they touch */}
          {PERSON_LINKS.map(({ pi, si }) => {
            const p = PEOPLE[pi];
            const s = SHARED[si];
            return (
              <motion.line
                key={`link-${pi}-${si}`}
                x1={p.l}
                y1={p.t}
                stroke="currentColor"
                strokeWidth={1.25}
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={{
                  x2: linksVisible ? s.l : p.l,
                  y2: linksVisible ? s.t : p.t,
                  opacity: linksVisible ? 1 : 0,
                }}
                transition={{ duration: 0.55, ease: "easeOut" }}
              />
            );
          })}
        </svg>

        {/* Central brain — appears with the people as the anchor. */}
        <At l={HUB.l} t={HUB.t}>
          <motion.div
            initial={false}
            animate={{
              opacity: peopleVisible ? 1 : 0,
              scale: peopleVisible ? 1 : 0.6,
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-4 py-2 text-background"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-background" />
            <span className="text-base font-medium">One shared brain</span>
          </motion.div>
        </At>

        {/* Shared-knowledge nodes */}
        {SHARED.map((s) => (
          <At key={`node-${s.label}`} l={s.l} t={s.t}>
            <motion.div
              initial={false}
              animate={{
                opacity: sharedVisible ? 1 : 0,
                scale: sharedVisible ? 1 : 0.5,
              }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-surface px-3 py-1.5"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
              <span className="text-sm text-foreground">{s.label}</span>
            </motion.div>
          </At>
        ))}

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
          Personal memories stay private. What&rsquo;s{" "}
          <span className="font-medium text-foreground">shared</span> becomes
          one brain the whole team — and every AI — can think inside.
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
