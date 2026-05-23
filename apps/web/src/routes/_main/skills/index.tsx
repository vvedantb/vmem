"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@vmem/backend";

export const Route = createFileRoute("/_main/skills/")({
  component: SkillsIndexPage,
});

function SkillsIndexPage() {
  const navigate = useNavigate();
  const skills = useQuery(api.skills.listMy);

  useEffect(() => {
    if (!skills || skills.length === 0) return;
    void navigate({
      to: "/skills/$id",
      params: { id: skills[0]._id },
      replace: true,
    });
  }, [skills, navigate]);

  return null;
}
