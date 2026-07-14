// resolve landing workspace and redirect (/home + legacy deep links)

import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { IconLoader2 } from "@tabler/icons-react";
import { readLastActiveProfileId } from "./active-profile";

export function WorkspaceEntryRedirect({
  subPath = "/home",
  search = "",
}: {
  // workspace-relative path to land on, e.g
  subPath?: string;
  // query string (including leading "?") to preserve across the redirect
  search?: string;
}) {
  const navigate = useNavigate();
  const profiles = useQuery(api.profiles.list);
  const webDefaultId = useQuery(api.userSettings.getDefaultProfile, {
    source: "web",
  });
  const getOrCreateDefault = useMutation(api.profiles.getOrCreateDefault);
  const creatingRef = useRef(false);

  useEffect(() => {
    if (profiles === undefined || webDefaultId === undefined) return;

    if (profiles.length === 0) {
      if (!creatingRef.current) {
        creatingRef.current = true;
        void getOrCreateDefault({});
      }
      return;
    }

    const byId = (id: string | null) =>
      id === null ? undefined : profiles.find((p) => p._id === id);
    const target =
      byId(readLastActiveProfileId()) ??
      byId(webDefaultId) ??
      profiles.find((p) => p.isDefault) ??
      profiles[0];
    if (target === undefined) return;

    void navigate({
      to: `/${target._id}${subPath}${search}`,
      replace: true,
    });
  }, [profiles, webDefaultId, getOrCreateDefault, navigate, subPath, search]);

  return (
    <div className="flex h-full items-center justify-center py-20">
      <IconLoader2 size={20} className="animate-spin text-muted" />
    </div>
  );
}
