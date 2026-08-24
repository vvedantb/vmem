import { useState, type ComponentType, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { IconHome } from "@tabler/icons-react";
import { Button, cn, motionDuration, motionEase } from "@vmem/ui";
import {
  IconMemories,
  IconWiki,
  IconSkills,
  IconFiles,
  IconCodebases,
  IconActivity,
  IconInbox,
  IconSettings,
} from "@/components/icons/sidebar";
import { VmemBrandText } from "@/components/shell/VmemBrand";
import { VmemDrawInIcon } from "@/components/icons/animations";
import { landingShellClass } from "./LandingReveal";
import { LandingHomePreview } from "./LandingHomePreview";
import { LandingMemoryPreview } from "./LandingMemoryPreview";
import { LandingListPreview } from "./LandingListPreview";
import { LandingWikiPreview } from "./LandingWikiPreview";
import { LandingSkillsPreview } from "./LandingSkillsPreview";

export type LandingStageView = "home" | "memories" | "wiki" | "skills";
type MemoriesTab = "graph" | "list";

const libraryItems = [
  { id: "memories", label: "Memories", icon: IconMemories, interactive: true },
  { id: "wiki", label: "Wiki", icon: IconWiki, interactive: true },
  { id: "skills", label: "Skills", icon: IconSkills, interactive: true },
  { id: "files", label: "Files", icon: IconFiles, interactive: false },
  {
    id: "codebases",
    label: "Codebases",
    icon: IconCodebases,
    interactive: false,
  },
] as const;

const accountItems = [
  { id: "activity", label: "Activity", icon: IconActivity },
  { id: "inbox", label: "Inbox", icon: IconInbox },
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
      className={cn(landingShellClass, "scroll-mt-24 pb-4 sm:pb-8")}
    >
      <div className="landing-app-frame relative overflow-hidden rounded-[1.5rem] bg-background p-2 shadow-panel outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10">
        <div className="flex min-h-[32rem] overflow-hidden rounded-2xl sm:min-h-[36rem] lg:min-h-[42rem]">
          <aside className="hidden w-52 shrink-0 flex-col bg-background md:flex">
            <div className="flex h-12 items-center gap-2 px-3">
              <VmemDrawInIcon size={18} className="text-foreground" />
              <VmemBrandText className="text-lg" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-3 scrollbar-thin">
              <NavButton
                label="Home"
                icon={IconHome}
                isActive={view === "home"}
                onClick={() => setView("home")}
                reduceMotion={reduceMotion === true}
              />
              <NavSection title="Library">
                {libraryItems.map((item) => (
                  <NavButton
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
                    reduceMotion={reduceMotion === true}
                  />
                ))}
              </NavSection>
              <NavSection title="Account">
                {accountItems.map((item) => (
                  <NavButton
                    key={item.id}
                    label={item.label}
                    icon={item.icon}
                    isActive={false}
                    disabled
                    reduceMotion={reduceMotion === true}
                  />
                ))}
              </NavSection>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted">
                <span className="tabular-nums text-foreground">128</span>{" "}
                memories
              </p>
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
  return <LandingMemoryPreview />;
}

function NavSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted/55">
        {title}
      </p>
      <div className="space-y-1 pl-2">{children}</div>
    </div>
  );
}

function NavButton({
  label,
  icon: Icon,
  isActive,
  disabled = false,
  onClick,
  reduceMotion,
}: {
  label: string;
  icon?: ComponentType<{ size?: number; stroke?: number }>;
  isActive: boolean;
  disabled?: boolean;
  onClick?: () => void;
  reduceMotion: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative h-10 w-full justify-start gap-3 rounded-lg px-3 text-sm font-medium",
        isActive ? "text-foreground" : "text-muted",
        disabled ? "cursor-default opacity-55" : "hover:text-foreground",
      )}
    >
      {isActive ? (
        <motion.span
          layoutId={reduceMotion ? undefined : "landing-nav-pill"}
          className="absolute inset-0 rounded-lg bg-surface-tertiary"
          transition={{ type: "spring", stiffness: 800, damping: 48 }}
        />
      ) : null}
      <span className="relative flex h-5 w-5 items-center justify-center">
        {Icon ? <Icon size={18} stroke={1.7} /> : null}
      </span>
      <span className="relative">{label}</span>
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
