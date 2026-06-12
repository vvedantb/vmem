import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { Variants } from "motion/react";
import { motionEase } from "@vmem/ui";
import { SlideShell } from "../_components/SlideShell";

// Apple keynote-style bento entrance: each tile slides in from outside
// the board (its nearest edge) and glides into its grid spot, lightly
// staggered, with a soft spring settle.
const boardVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.15 },
  },
};

/** Direction a tile flies in from, expressed as its off-board offset. */
interface BentoFrom {
  x?: number;
  y?: number;
}

const tileVariants: Variants = {
  hidden: (from: BentoFrom) => ({
    opacity: 0,
    x: from.x ?? 0,
    y: from.y ?? 0,
    scale: 0.96,
  }),
  show: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 55,
      damping: 16,
      mass: 1.1,
      opacity: { duration: 0.6, ease: motionEase },
    },
  },
};

interface BentoCellProps {
  children: ReactNode;
  /** Off-board offset the tile slides in from (e.g. { x: -240 }). */
  from: BentoFrom;
  className?: string;
}

function BentoCell({ children, from, className = "" }: BentoCellProps) {
  return (
    <motion.div variants={tileVariants} custom={from} className={className}>
      {children}
    </motion.div>
  );
}

interface BentoTileProps {
  title: string;
  description?: string;
  /** Larger serif title for hero/feature tiles. */
  large?: boolean;
  /** Inverted tile (foreground background) for the hero. */
  inverted?: boolean;
  /** Anchor content to the bottom (Apple-style) instead of centering. */
  bottom?: boolean;
  children?: ReactNode;
}

function BentoTile({
  title,
  description,
  large = false,
  inverted = false,
  bottom = false,
  children,
}: BentoTileProps) {
  return (
    <div
      className={`flex h-full flex-col rounded-3xl p-6 ${
        bottom ? "justify-end" : "justify-center"
      } ${inverted ? "bg-foreground" : "bg-surface-secondary"}`}
    >
      <h3
        className={`font-instrumentSerif font-normal leading-tight tracking-tight ${
          large ? "text-4xl" : "text-2xl"
        } ${inverted ? "text-background" : "text-foreground"}`}
      >
        {title}
      </h3>
      {description ? (
        <p
          className={`mt-1.5 text-xs leading-snug ${
            inverted ? "text-background opacity-60" : "text-muted"
          }`}
        >
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}

const integrations = [
  "AgentMail",
  "AgentCard",
  "AgentBrowser",
  "AgentSandbox",
] as const;

export function Slide13Bento() {
  return (
    <SlideShell className="!px-14 !py-12">
      {/* Wrapper clips the spotlight sweep to the board bounds */}
      <div className="relative h-full overflow-hidden">
        <motion.div
          className="grid h-full grid-cols-4 grid-rows-6 gap-4"
          variants={boardVariants}
          initial="hidden"
          animate="show"
        >
          <BentoCell from={{ x: -280 }} className="col-span-1 row-span-4">
            <BentoTile
              title="Web"
              description="Manage your memories"
              large
              inverted
              bottom
            />
          </BentoCell>
          <BentoCell from={{ y: -240 }} className="col-span-2 row-span-2">
            <BentoTile
              title="Browser extension"
              description="Sync browser history, bookmarks, and other data"
              large
              bottom
            />
          </BentoCell>
          <BentoCell from={{ x: 280 }} className="col-span-1 row-span-4">
            <BentoTile title="Integrations" bottom>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {integrations.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </BentoTile>
          </BentoCell>
          <BentoCell
            from={{ y: 220, x: -60 }}
            className="col-span-1 row-span-2"
          >
            <BentoTile
              title="MCP Connector"
              description="One connection, everywhere"
              bottom
            />
          </BentoCell>
          <BentoCell from={{ y: 220, x: 60 }} className="col-span-1 row-span-2">
            <BentoTile
              title="Developer SDK"
              description="Cut agentic memory development times"
              bottom
            />
          </BentoCell>
          <BentoCell from={{ x: -240 }} className="col-span-1 row-span-1">
            <BentoTile
              title="Mobile"
              description="Interact with your data, privately"
            />
          </BentoCell>
          <BentoCell from={{ y: 200 }} className="col-span-1 row-span-1">
            <BentoTile
              title="Files"
              description="Give your agent its own file explorer"
            />
          </BentoCell>
          <BentoCell from={{ y: 240 }} className="col-span-1 row-span-2">
            <BentoTile
              title="Wiki"
              description="Knowledge system for the agent to store longer texts"
              bottom
            />
          </BentoCell>
          <BentoCell from={{ x: 260 }} className="col-span-1 row-span-2">
            <BentoTile
              title="Codebases"
              description="Sync code structure"
              bottom
            />
          </BentoCell>
          <BentoCell from={{ x: -240 }} className="col-span-1 row-span-1">
            <BentoTile
              title="Skills"
              description="Define skills once, use everywhere"
            />
          </BentoCell>
          <BentoCell from={{ y: 200 }} className="col-span-1 row-span-1">
            <BentoTile
              title="Profiles"
              description="Create spaces for your memories"
            />
          </BentoCell>
        </motion.div>

        {/* Spotlight sweep: diagonal light band loops continuously after tiles land.
            Clipped by the relative overflow-hidden wrapper above. Peak opacity ~0.08. */}
        <motion.div
          className="pointer-events-none absolute inset-y-[-25%] w-1/3"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
            rotate: -18,
          }}
          initial={{ x: "-80%" }}
          animate={{ x: "320%" }}
          transition={{
            delay: 2.6,
            duration: 1.6,
            ease: [0.22, 1, 0.36, 1],
            repeat: Infinity,
            repeatDelay: 0.8,
          }}
          aria-hidden
        />
      </div>
    </SlideShell>
  );
}
