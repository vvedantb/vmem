import { useState } from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "motion/react";
import {
  Badge,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
  motionDuration,
  motionEase,
} from "@vmem/ui";
import { formatCompactRelativeTime } from "@vmem/shared";
import { tagToColor } from "@vmem/shared/graph";
import { MemorySourceIcon } from "@/components/_components/MemorySourceIcon";
import ShapeIndicator from "@/components/_components/ShapeIndicator";
import { formatMemorySourceLabel, formatMemoryTypeLabel } from "@/lib/memories";
import {
  demoMemories,
  demoSkillMemory,
  type DemoMemory,
} from "./landing-preview-data";

type PanelTab = "details" | "connections";

export function LandingListPreview() {
  const [selectedId, setSelectedId] = useState("episodic");
  const selected =
    demoMemories.find((memory) => memory.id === selectedId) ??
    demoMemories[0] ??
    demoSkillMemory;

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin md:px-3">
        <div className="flex flex-col gap-0.5 pt-1">
          {demoMemories.map((memory) => (
            <ListRow
              key={memory.id}
              memory={memory}
              isSelected={memory.id === selectedId}
              onSelect={() => setSelectedId(memory.id)}
            />
          ))}
        </div>
      </div>

      <aside className="hidden w-[min(100%,18rem)] shrink-0 border-l border-separator lg:flex lg:flex-col">
        <DetailPanel memory={selected} />
      </aside>
    </div>
  );
}

function ListRow({
  memory,
  isSelected,
  onSelect,
}: {
  memory: DemoMemory;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const color = tagToColor(memory.tags[0] ?? memory.type, isDark);

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={cn(
        "h-auto w-full justify-start gap-2 rounded-lg px-3 py-2.5 text-left",
        isSelected && "bg-surface-secondary",
      )}
    >
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center text-muted"
        aria-label={formatMemorySourceLabel(memory.source)}
      >
        <MemorySourceIcon source={memory.source} size={14} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {memory.title}
      </span>
      <ShapeIndicator kind="memory" color={color} className="h-2.5 w-2.5" />
      <span className="shrink-0 text-xs tabular-nums text-muted">
        {formatCompactRelativeTime(memory.createdAt)}
      </span>
    </Button>
  );
}

function DetailPanel({ memory }: { memory: DemoMemory }) {
  const [tab, setTab] = useState<PanelTab>("details");

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
      <p className="truncate text-sm font-medium text-foreground">
        {memory.title}
      </p>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === "details" || value === "connections") setTab(value);
        }}
        className="mt-3 flex min-h-0 flex-1 flex-col"
      >
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
        </TabsList>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${memory.id}-${tab}`}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{
                opacity: 0,
                y: -8,
                filter: "blur(4px)",
                transition: { duration: 0.15, ease: "easeIn" },
              }}
              transition={{ duration: motionDuration.fast, ease: motionEase }}
            >
              {tab === "details" ? (
                <DetailsBody memory={memory} />
              ) : (
                <ConnectionsBody memory={memory} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </Tabs>
    </div>
  );
}

function DetailsBody({ memory }: { memory: DemoMemory }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-surface-secondary/60 p-4">
        <p className="text-pretty text-[13px] leading-relaxed text-foreground">
          {memory.content}
        </p>
      </div>
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted">Source</h4>
        <p className="text-sm text-foreground">
          {formatMemorySourceLabel(memory.source)} ·{" "}
          {formatMemoryTypeLabel(memory.type)}
        </p>
      </div>
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted">Tags</h4>
        <div className="flex flex-wrap gap-1.5">
          {memory.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConnectionsBody({ memory }: { memory: DemoMemory }) {
  return (
    <div className="space-y-2">
      {memory.connections.map((connection) => (
        <div
          key={connection.title}
          className="rounded-lg bg-surface-secondary/60 px-3 py-2.5"
        >
          <p className="text-sm font-medium text-foreground">
            {connection.title}
          </p>
          <p className="mt-0.5 text-xs text-muted">{connection.reason}</p>
        </div>
      ))}
    </div>
  );
}
