"use client";

import { useMemo, useState, lazy, Suspense } from "react";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useQueryStates } from "nuqs";
import { motion } from "motion/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { Button, cn, motionDuration, motionEase } from "@vmem/ui";
import { IconApps, IconBolt } from "@tabler/icons-react";
import { SkillCard } from "@/components/skills/SkillCard";
import { SkillBulkDeleteBar } from "@/components/skills/SkillBulkDeleteBar";
import { SkillsSearchBar } from "@/components/skills/SkillsSearchBar";
import { SkillsAddMenu } from "@/components/skills/SkillsAddMenu";
import { skillsSearchParams } from "@/routes/_main/$profileId/skills/-searchParams";
import { SharedLayoutBackground } from "./SharedLayoutBackground";
import { sidebarListRowClass } from "./sidebar-nav-row";
import {
  useActiveProfileId,
  useActiveTeamId,
} from "@/components/workspace/active-profile";

const WriteSkillDialog = lazy(() =>
  import("@/components/skills/WriteSkillDialog").then((m) => ({
    default: m.WriteSkillDialog,
  })),
);
const UploadSkillDialog = lazy(() =>
  import("@/components/skills/UploadSkillDialog").then((m) => ({
    default: m.UploadSkillDialog,
  })),
);

export type SkillsSidebarNavProps = {
  isIconOnly: boolean;
  isMobile: boolean;
};

type CreateModalState = "none" | "write" | "upload";

export function SkillsSidebarNav({
  isIconOnly,
  isMobile,
}: SkillsSidebarNavProps) {
  const navigate = useNavigate();
  const profileId = useActiveProfileId();
  const teamId = useActiveTeamId();
  const params = useParams({ strict: false });
  const skillId = typeof params.id === "string" ? params.id : undefined;
  const activeSystemSkillId =
    typeof params.skillId === "string" ? params.skillId : undefined;
  const pathname = useLocation({ select: (l) => l.pathname });
  const onHub = pathname.endsWith("/skills/hub");

  const skills = useQuery(api.skills.listMy, { teamId });
  const catalog = useQuery(api.systemSkills.listCatalog, { teamId });
  const installedSystemSkills = useMemo(
    () => (catalog ?? []).filter((entry) => entry.installed),
    [catalog],
  );
  const [{ q: searchQuery }, setSearchParams] =
    useQueryStates(skillsSearchParams);
  const [createModal, setCreateModal] = useState<CreateModalState>("none");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"skills">>>(
    () => new Set(),
  );

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: Id<"skills">) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredSkills = useMemo(() => {
    if (!skills) return [];
    const query = searchQuery.trim().toLowerCase();
    if (query.length === 0) return skills;
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query),
    );
  }, [skills, searchQuery]);

  const openSkill = (id: Id<"skills">) => {
    if (profileId === undefined) return;
    void navigate({
      to: "/$profileId/skills/$id",
      params: { profileId, id },
    });
  };

  const handleSkillCreated = (id: Id<"skills">) => {
    openSkill(id);
  };

  // Grouped with the search at the top of the sidebar (shared by the empty and
  // populated states), replacing the old bottom-pinned button.
  const addMenu = (
    <SkillsAddMenu
      className="w-full gap-2"
      onWriteSkill={() => setCreateModal("write")}
      onUploadSkill={() => setCreateModal("upload")}
    />
  );

  const goHub = () => {
    if (profileId === undefined) return;
    void navigate({ to: "/$profileId/skills/hub", params: { profileId } });
  };

  const goSystemSkill = (id: Id<"systemSkills">) => {
    if (profileId === undefined) return;
    void navigate({
      to: "/$profileId/skills/system/$skillId",
      params: { profileId, skillId: id },
    });
  };

  const hubButton = (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "w-full justify-start gap-2 text-muted hover:text-foreground",
        onHub && "bg-surface-tertiary text-foreground",
      )}
      onClick={goHub}
    >
      <IconApps size={16} />
      Skills Hub
    </Button>
  );

  // Installed system skills for this workspace (personal vs team installs are split).
  const installedSection =
    !isIconOnly && !selectionMode && installedSystemSkills.length > 0 ? (
      <div className="mt-3 space-y-1">
        <p className="px-3 py-1 text-xs font-medium text-muted">
          Installed system skills
        </p>
        <SharedLayoutBackground.Root
          layoutId="skills-system"
          className="gap-0.5"
        >
          {installedSystemSkills.map((entry) => (
            <SharedLayoutBackground.Item
              key={entry._id}
              id={entry._id}
              isActive={activeSystemSkillId === entry._id}
            >
              <Button
                type="button"
                variant="ghost"
                onClick={() => goSystemSkill(entry._id)}
                className={cn(
                  "h-auto w-full min-w-0 justify-start rounded-lg text-left text-sm font-normal transition-[color] active:scale-100",
                  sidebarListRowClass,
                  activeSystemSkillId === entry._id
                    ? "text-foreground hover:bg-transparent"
                    : "text-muted hover:bg-transparent hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    entry.installEnabled ? "bg-success" : "bg-default",
                  )}
                />
                <span className="min-w-0 truncate">{entry.name}</span>
              </Button>
            </SharedLayoutBackground.Item>
          ))}
        </SharedLayoutBackground.Root>
      </div>
    ) : null;

  return (
    <motion.nav
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin px-1">
        {skills === undefined ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
          </div>
        ) : skills.length === 0 ? (
          <>
            {!isIconOnly ? (
              <div className="flex flex-col gap-2">
                {addMenu}
                {hubButton}
              </div>
            ) : null}
            <div className="flex flex-col items-center justify-center px-2 py-10 text-center">
              <IconBolt size={28} className="mb-2 text-muted" />
              {!isIconOnly ? (
                <p className="text-xs text-muted">No skills yet</p>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {!isIconOnly && !selectionMode ? (
              <div className="flex flex-col gap-2">
                <SkillsSearchBar
                  value={searchQuery}
                  onChange={(value) => {
                    void setSearchParams({ q: value });
                  }}
                />
                {addMenu}
                {hubButton}
              </div>
            ) : null}
            {!isIconOnly ? (
              selectionMode ? (
                <SkillBulkDeleteBar
                  selectedIds={selectedIds}
                  teamId={teamId}
                  onExit={exitSelection}
                />
              ) : (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted"
                    onClick={() => setSelectionMode(true)}
                  >
                    Select
                  </Button>
                </div>
              )
            ) : null}
            {filteredSkills.length === 0 ? (
              !isIconOnly ? (
                <p className="px-2 py-4 text-center text-xs text-muted">
                  No skills match your search.
                </p>
              ) : null
            ) : (
              <SharedLayoutBackground.Root
                layoutId="skills-nav"
                className="gap-0.5"
              >
                {filteredSkills.map((skill) => (
                  <SharedLayoutBackground.Item
                    key={skill._id}
                    id={skill._id}
                    isActive={!selectionMode && skillId === skill._id}
                  >
                    <SkillCard
                      skill={skill}
                      selected={skillId === skill._id}
                      onSelect={() => openSkill(skill._id)}
                      mode={
                        selectionMode && !isIconOnly
                          ? "bulk-select"
                          : "navigate"
                      }
                      checked={selectedIds.has(skill._id)}
                      onToggleSelect={() => toggleSelect(skill._id)}
                    />
                  </SharedLayoutBackground.Item>
                ))}
              </SharedLayoutBackground.Root>
            )}
          </>
        )}
        {installedSection}
      </div>

      {createModal === "write" ? (
        <Suspense fallback={null}>
          <WriteSkillDialog
            open
            onOpenChange={(open) => {
              if (!open) setCreateModal("none");
            }}
            onCreated={handleSkillCreated}
          />
        </Suspense>
      ) : null}

      {createModal === "upload" ? (
        <Suspense fallback={null}>
          <UploadSkillDialog
            open
            onOpenChange={(open) => {
              if (!open) setCreateModal("none");
            }}
            onCreated={handleSkillCreated}
          />
        </Suspense>
      ) : null}
    </motion.nav>
  );
}
