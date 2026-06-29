import type { ComponentType, ReactNode } from "react";
import { motion } from "motion/react";
import type { Variants } from "motion/react";
import {
  IconBolt,
  IconBook2,
  IconBrowser,
  IconCode,
  IconDeviceMobile,
  IconFiles,
  IconLayoutDashboard,
  IconLayoutGrid,
  IconPlug,
  IconPlugConnected,
  IconBinaryTree2,
} from "@tabler/icons-react";
import { motionEase } from "@vmem/ui";
import {
  GoogleDriveIcon,
  OneDriveIcon,
  DropboxIcon,
  GmailIcon,
  NotionIcon,
  GitHubIcon,
  LinearIcon,
} from "@/components/brand-icons";
import { SlideShell } from "../_components/SlideShell";
import {
  HistoryMockup,
  WikiMockup,
  FileTreeMockup,
  McpMockup,
  WebMockup,
  SkillsMockup,
} from "../_components/BentoMockups";

type TablerIcon = ComponentType<{ size?: number; stroke?: number }>;
type BrandIcon = ComponentType<{ size?: number; className?: string }>;

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
  /** Inverted tile (foreground background) for the hero. */
  inverted?: boolean;
  /** Anchor content to the bottom (Apple-style) instead of centering. */
  bottom?: boolean;
  /** Per-tile glyph shown inline above the title. */
  icon?: TablerIcon;
  /**
   * Mini mockup that fills the upper area of the tile and fades toward the
   * title (reference-deck style). When set, the title + description anchor to
   * the bottom and the glyph moves inline above the title.
   */
  preview?: ReactNode;
  /** Fade the preview into the title. Off for content lists (e.g. Connectors). */
  previewMask?: boolean;
  /** Horizontal layout (glyph left, text right) — fits the short 1×1 tiles. */
  compact?: boolean;
  children?: ReactNode;
}

function BentoTile({
  title,
  description,
  inverted = false,
  bottom = false,
  icon: Icon,
  preview,
  previewMask = true,
  compact = false,
  children,
}: BentoTileProps) {
  const surface = inverted ? "bg-foreground" : "bg-surface-secondary";
  const titleColor = inverted ? "text-background" : "text-foreground";
  const descColor = inverted ? "text-background opacity-60" : "text-muted";

  // Compact tiles lay the glyph beside the text so a short 1×1 cell isn't
  // squished by a stacked glyph + title + description.
  if (compact) {
    return (
      <div
        className={`relative flex h-full items-center gap-3.5 overflow-hidden rounded-3xl p-5 ${surface}`}
      >
        {Icon ? (
          <span className={`shrink-0 opacity-50 ${titleColor}`} aria-hidden>
            <Icon size={22} stroke={1.5} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h3
            className={`font-instrumentSerif text-2xl font-normal leading-tight tracking-tight ${titleColor}`}
          >
            {title}
          </h3>
          {description ? (
            <p className={`mt-0.5 text-xs leading-snug ${descColor}`}>
              {description}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-3xl p-6 ${
        preview ? "" : bottom ? "justify-end" : "justify-center"
      } ${surface}`}
    >
      {/* Mockup fills the upper area (centred) and fades into the title below. */}
      {preview ? (
        <div
          className={`relative mb-4 flex min-h-0 flex-1 flex-col justify-center overflow-hidden ${
            previewMask
              ? "[-webkit-mask-image:linear-gradient(to_bottom,transparent,black_16%,black_84%,transparent)] [mask-image:linear-gradient(to_bottom,transparent,black_16%,black_84%,transparent)]"
              : ""
          }`}
        >
          {preview}
        </div>
      ) : null}

      {/* Inline glyph above the title — on every tile. */}
      {Icon ? (
        <span className={`mb-2 shrink-0 opacity-50 ${titleColor}`} aria-hidden>
          <Icon size={18} stroke={1.5} />
        </span>
      ) : null}

      <h3
        className={`font-instrumentSerif text-2xl font-normal leading-tight tracking-tight ${titleColor}`}
      >
        {title}
      </h3>
      {description ? (
        <p className={`mt-1.5 text-xs leading-snug ${descColor}`}>
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}

const connectors: { name: string; Icon: BrandIcon }[] = [
  { name: "Google Drive", Icon: GoogleDriveIcon },
  { name: "OneDrive", Icon: OneDriveIcon },
  { name: "Dropbox", Icon: DropboxIcon },
  { name: "Gmail", Icon: GmailIcon },
  { name: "Notion", Icon: NotionIcon },
  { name: "Linear", Icon: LinearIcon },
  { name: "GitHub", Icon: GitHubIcon },
];

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
              title="MCP Connector"
              description="One connection, everywhere"
              inverted
              icon={IconPlug}
              preview={<McpMockup />}
            />
          </BentoCell>
          <BentoCell from={{ y: -240 }} className="col-span-2 row-span-2">
            <BentoTile
              title="Browser extension"
              description="Sync browser history, bookmarks, and other data"
              icon={IconBrowser}
              preview={<HistoryMockup />}
            />
          </BentoCell>
          <BentoCell from={{ x: 280 }} className="col-span-1 row-span-4">
            <BentoTile
              title="Connectors"
              description="Pull in files, docs, and issues from the tools you already use."
              icon={IconPlugConnected}
              previewMask={false}
              preview={
                <ul className="space-y-2">
                  {connectors.map(({ name, Icon }) => (
                    <li key={name} className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-neutral-900">
                        <Icon size={14} />
                      </span>
                      <span className="text-sm text-muted">{name}</span>
                    </li>
                  ))}
                </ul>
              }
            />
          </BentoCell>
          <BentoCell
            from={{ y: 220, x: -60 }}
            className="col-span-1 row-span-2"
          >
            <BentoTile
              title="Web"
              description="Browse, search, and curate."
              icon={IconLayoutDashboard}
              preview={<WebMockup />}
            />
          </BentoCell>
          <BentoCell from={{ y: 220, x: 60 }} className="col-span-1 row-span-2">
            <BentoTile
              title="Wiki"
              description="Long-form docs for your agent."
              icon={IconBook2}
              preview={<WikiMockup />}
            />
          </BentoCell>
          <BentoCell from={{ x: -240 }} className="col-span-1 row-span-2">
            <BentoTile
              title="Codebases"
              description="Sync how your code fits together."
              icon={IconBinaryTree2}
              preview={<FileTreeMockup />}
            />
          </BentoCell>
          <BentoCell from={{ y: 240 }} className="col-span-1 row-span-2">
            <BentoTile
              title="Skills"
              description="Define skills once, use everywhere"
              icon={IconBolt}
              preview={<SkillsMockup />}
            />
          </BentoCell>
          <BentoCell from={{ y: 200 }} className="col-span-1 row-span-1">
            <BentoTile
              title="Developer SDK"
              description="Add memory to your agents."
              icon={IconCode}
              compact
            />
          </BentoCell>
          <BentoCell from={{ x: 260 }} className="col-span-1 row-span-1">
            <BentoTile
              title="Mobile"
              description="Privately interact with data."
              icon={IconDeviceMobile}
              compact
            />
          </BentoCell>
          <BentoCell from={{ y: 200 }} className="col-span-1 row-span-1">
            <BentoTile
              title="Files"
              description="A file system for agents."
              icon={IconFiles}
              compact
            />
          </BentoCell>
          <BentoCell from={{ x: 260 }} className="col-span-1 row-span-1">
            <BentoTile
              title="Profiles"
              description="Personal and work spaces."
              icon={IconLayoutGrid}
              compact
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
