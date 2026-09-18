import { useState, type ComponentType } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button, cn, motionDuration, motionEase } from "@vmem/ui";
import {
  IconMemories,
  IconWiki,
  IconSkills,
  IconFiles,
  IconInbox,
  IconSettings,
} from "@/components/icons/sidebar";
import { VmemBrandText } from "@/components/shell/VmemBrand";
import { VmemDrawInIcon } from "@/components/icons/animations";
import {
  RAIL_TILE_CLASS,
  railTileStateClass,
} from "@/components/sidebar/sidebar-nav-row";
import { landingShellClass } from "./LandingReveal";
import { LandingHomePreview } from "./LandingHomePreview";
import { LandingMemoryPreview } from "./LandingMemoryPreview";
import { LandingListPreview } from "./LandingListPreview";
import { LandingTimelinePreview } from "./LandingTimelinePreview";
import { LandingWikiPreview } from "./LandingWikiPreview";
import { LandingSkillsPreview } from "./LandingSkillsPreview";

export type LandingStageView = "home" | "memories" | "wiki" | "skills";
type MemoriesTab = "graph" | "list" | "timeline";

const libraryItems = [
  { id: "memories", label: "Memories", icon: IconMemories, interactive: true },
  { id: "wiki", label: "Wiki", icon: IconWiki, interactive: true },
  { id: "skills", label: "Skills", icon: IconSkills, interactive: true },
  { id: "files", label: "Files", icon: IconFiles, interactive: false },
] as const;

const accountItems = [
  { id: "settings", label: "Settings", icon: IconSettings },
] as const;

const pageTitle: Record<LandingStageView, string> = {
  home: "Dashboard",
  memories: "Memories",
  wiki: "Wiki",
  skills: "Skills",
};

export function LandingAppStage() {
  const [view, setView] = useState<LandingStageView>("memories");
  const [memoriesTab, setMemoriesTab] = useState<MemoriesTab>("graph");
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="product"
      className={cn(landingShellClass, "scroll-mt-24 py-10 sm:py-16")}
    >
      <div className="landing-app-frame relative overflow-hidden rounded-[1.5rem] border border-separator bg-background p-2">
        <div className="flex min-h-[32rem] overflow-hidden rounded-2xl sm:min-h-[36rem] lg:min-h-[42rem]">
          <aside className="hidden shrink-0 md:flex">
            <div className="flex w-16 flex-col items-center border-r border-separator bg-background">
              <div className="flex w-full flex-col items-center gap-1.5 pt-3">
                <LandingRailTile
                  label="Home"
                  icon={VmemDrawInIcon}
                  isActive={view === "home"}
                  onClick={() => setView("home")}
                />
                <LandingRailTile
                  label="Inbox"
                  icon={IconInbox}
                  isActive={false}
                  disabled
                />
                <div className="h-px w-8 bg-separator" aria-hidden />
              </div>
              <div className="flex w-full flex-1 flex-col items-center gap-1.5 py-2">
                {libraryItems.map((item) => (
                  <LandingRailTile
                    key={item.id}
                    label={item.label}
                    icon={item.icon}
                    isActive={item.interactive && view === item.id}
                    disabled={!item.interactive}
                    onClick={() => {
                      if (
                        item.id === "memories" ||
                        item.id === "wiki" ||
                        item.id === "skills"
                      ) {
                        setView(item.id);
                      }
                    }}
                  />
                ))}
                <div className="h-px w-8 bg-separator" aria-hidden />
                {accountItems.map((item) => (
                  <LandingRailTile
                    key={item.id}
                    label={item.label}
                    icon={item.icon}
                    isActive={false}
                    disabled
                  />
                ))}
              </div>
            </div>
            <div className="flex w-40 flex-col bg-background">
              <div className="flex h-12 items-center justify-center px-3">
                <h2 className="truncate font-instrumentSerif text-lg leading-none text-foreground">
                  {pageTitle[view]}
                </h2>
              </div>
              <div className="flex items-center gap-2 px-3">
                <VmemDrawInIcon size={16} className="text-foreground" />
                <VmemBrandText className="text-base" />
              </div>
              <div className="mt-auto px-4 py-3">
                <p className="text-[11px] text-muted">
                  <span className="tabular-nums text-foreground">128</span>{" "}
                  memories
                </p>
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface md:rounded-lg">
            <div className="flex shrink-0 flex-col gap-3 px-3 pt-3 md:px-4 md:pt-4">
              <div className="flex min-h-10 items-center justify-between gap-3">
                <h2 className="font-instrumentSerif text-2xl leading-tight text-foreground text-balance">
                  {pageTitle[view]}
                </h2>
                {view === "memories" ? (
                  <MemoriesTabs value={memoriesTab} onChange={setMemoriesTab} />
                ) : null}
              </div>
              <MobileViewSwitch value={view} onChange={setView} />
            </div>

            <div className="relative min-h-0 flex-1">
              <motion.div
                key={view === "memories" ? `${view}-${memoriesTab}` : view}
                className="absolute inset-0 overflow-hidden"
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, y: 12, filter: "blur(4px)" }
                }
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  duration: motionDuration.base,
                  ease: motionEase,
                }}
              >
                <StageBody view={view} memoriesTab={memoriesTab} />
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StageBody({
  view,
  memoriesTab,
}: {
  view: LandingStageView;
  memoriesTab: MemoriesTab;
}) {
  if (view === "home") return <LandingHomePreview />;
  if (view === "wiki") return <LandingWikiPreview />;
  if (view === "skills") return <LandingSkillsPreview />;
  if (memoriesTab === "list") return <LandingListPreview />;
  if (memoriesTab === "timeline") return <LandingTimelinePreview />;
  return <LandingMemoryPreview />;
}

function LandingRailTile({
  label,
  icon: Icon,
  isActive,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  isActive: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        RAIL_TILE_CLASS,
        "group h-11 w-11 p-0",
        railTileStateClass(isActive),
        disabled && "cursor-default",
      )}
    >
      <Icon size={22} className="text-current" />
    </Button>
  );
}

function MemoriesTabs({
  value,
  onChange,
}: {
  value: MemoriesTab;
  onChange: (tab: MemoriesTab) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-segment p-0.5">
      <Button
        type="button"
        size="sm"
        variant={value === "graph" ? "secondary" : "ghost"}
        onClick={() => onChange("graph")}
        className={cn(
          "h-8 rounded-full px-3",
          value === "graph" ? "text-foreground" : "text-muted",
        )}
      >
        Graph
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === "list" ? "secondary" : "ghost"}
        onClick={() => onChange("list")}
        className={cn(
          "h-8 rounded-full px-3",
          value === "list" ? "text-foreground" : "text-muted",
        )}
      >
        List
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === "timeline" ? "secondary" : "ghost"}
        onClick={() => onChange("timeline")}
        className={cn(
          "h-8 rounded-full px-3",
          value === "timeline" ? "text-foreground" : "text-muted",
        )}
      >
        Timeline
      </Button>
    </div>
  );
}

function MobileViewSwitch({
  value,
  onChange,
}: {
  value: LandingStageView;
  onChange: (view: LandingStageView) => void;
}) {
  const views: LandingStageView[] = ["home", "memories", "wiki", "skills"];
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin md:hidden">
      {views.map((view) => (
        <Button
          key={view}
          type="button"
          size="sm"
          variant={value === view ? "default" : "secondary"}
          onClick={() => onChange(view)}
          className="h-9 shrink-0 rounded-full px-3 text-xs capitalize"
        >
          {view}
        </Button>
      ))}
    </div>
  );
}
