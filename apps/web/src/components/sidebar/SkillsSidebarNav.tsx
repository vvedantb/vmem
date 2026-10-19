import { useState, lazy, Suspense } from "react";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useQueryStates } from "nuqs";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { Button, Sidebar, Spinner, cn } from "@vvedantb/ui";
import { IconApps, IconBolt, IconListCheck } from "@tabler/icons-react";
import { SkillCard } from "@/components/skills/SkillCard";
import { SkillBulkDeleteBar } from "@/components/skills/SkillBulkDeleteBar";
import { SkillsAddMenu } from "@/components/skills/SkillsAddMenu";
import { skillsSearchParams } from "@/lib/url-state/skills";
import { SidebarListSearchBar } from "./SidebarListSearchBar";
import { SidebarHeaderTrailing } from "./SidebarHeaderTrailing";
import { useIdSelection } from "@/hooks/useIdSelection";
import {
  useActiveProfileId,
  useActiveTeamId,
} from "@/components/workspace/active-profile";
import { SubSidebarShell } from "./SubSidebarShell";

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
  const installedSystemSkills = (catalog ?? []).filter(
    (entry) => entry.installed,
  );
  const [{ q: searchQuery }, setSearchParams] =
    useQueryStates(skillsSearchParams);
  const [createModal, setCreateModal] = useState<CreateModalState>("none");
  const {
    selectionMode,
    selectedIds,
    setSelectionMode,
    exitSelection,
    toggle,
  } = useIdSelection<Id<"skills">>();

  const query = searchQuery.trim().toLowerCase();
  const filteredSkills = !skills
    ? []
    : query.length === 0
      ? skills
      : skills.filter(
          (skill) =>
            skill.name.toLowerCase().includes(query) ||
            skill.description.toLowerCase().includes(query),
        );

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

  const toolbarAddMenu = (
    <SkillsAddMenu
      onWriteSkill={() => setCreateModal("write")}
      onUploadSkill={() => setCreateModal("upload")}
    />
  );

  const selectButton = (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label="Select"
      className="shrink-0"
      onClick={() => setSelectionMode(true)}
    >
      <IconListCheck size={16} />
    </Button>
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
    <Sidebar.NavItem
      active={onHub}
      onClick={goHub}
      icon={<IconApps size={19} stroke={1.7} />}
    >
      <Sidebar.NavItemLabel className="text-left">
        Skills Hub
      </Sidebar.NavItemLabel>
    </Sidebar.NavItem>
  );

  const hubSection = !isIconOnly ? (
    <div className="mt-2 mb-3 shrink-0">{hubButton}</div>
  ) : null;

  // installed system skills for this workspace (personal vs team installs are split)
  const installedSection =
    !isIconOnly && !selectionMode && installedSystemSkills.length > 0 ? (
      <div className="mt-3 space-y-1">
        <p className="px-4 py-1 text-xs font-medium text-muted">
          Installed system skills
        </p>
        <div className="flex flex-col gap-0.5">
          {installedSystemSkills.map((entry) => (
            <Sidebar.NavItem
              key={entry._id}
              active={activeSystemSkillId === entry._id}
              onClick={() => goSystemSkill(entry._id)}
            >
              <Sidebar.NavItemLeading>
                <span
                  aria-hidden
                  className={cn(
                    "size-2 rounded-full",
                    entry.installEnabled ? "bg-success" : "bg-default",
                  )}
                />
              </Sidebar.NavItemLeading>
              <Sidebar.NavItemLabel className="text-left">
                {entry.name}
              </Sidebar.NavItemLabel>
            </Sidebar.NavItem>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <SubSidebarShell isMobile={isMobile}>
      {!isIconOnly ? (
        <SidebarHeaderTrailing>{toolbarAddMenu}</SidebarHeaderTrailing>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin px-1">
        {skills === undefined ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="sm" />
          </div>
        ) : skills.length === 0 ? (
          <>
            {!isIconOnly ? hubSection : null}
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
              <>
                <div className="shrink-0">
                  <SidebarListSearchBar
                    value={searchQuery}
                    onChange={(value) => {
                      void setSearchParams({ q: value });
                    }}
                    placeholder="Search skills"
                    aria-label="Search skills"
                    actions={selectButton}
                  />
                </div>
                {hubSection}
              </>
            ) : null}
            {!isIconOnly && selectionMode ? (
              <SkillBulkDeleteBar
                selectedIds={selectedIds}
                onExit={exitSelection}
              />
            ) : null}
            {filteredSkills.length === 0 ? (
              !isIconOnly ? (
                <p className="px-2 py-4 text-center text-xs text-muted">
                  No skills match your search.
                </p>
              ) : null
            ) : (
              <div className="flex flex-col gap-0.5">
                {filteredSkills.map((skill) => (
                  <SkillCard
                    key={skill._id}
                    skill={skill}
                    selected={skillId === skill._id}
                    onSelect={() => openSkill(skill._id)}
                    mode={
                      selectionMode && !isIconOnly ? "bulk-select" : "navigate"
                    }
                    checked={selectedIds.has(skill._id)}
                    onToggleSelect={() => toggle(skill._id)}
                  />
                ))}
              </div>
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
    </SubSidebarShell>
  );
}
