"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";

export const Route = createFileRoute("/_main/$profileId/skills/")({
  component: SkillsIndexPage,
});

function SkillsIndexPage() {
  const { profileId } = Route.useParams();
  const teamId = useActiveProfile().teamId;
  const navigate = useNavigate();
  const skills = useQuery(api.skills.listMy, { teamId });

  useEffect(() => {
    const first = skills?.at(0);
    if (!first) return;
    void navigate({
      to: "/$profileId/skills/$id",
      params: { profileId, id: first._id },
      replace: true,
    });
  }, [skills, navigate, profileId]);

  return null;
}
