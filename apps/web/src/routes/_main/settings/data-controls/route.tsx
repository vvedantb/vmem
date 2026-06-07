"use client";

import { createFileRoute, Outlet } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { DataControlsTabs } from "./-components/DataControlsTabs";

export const Route = createFileRoute("/_main/settings/data-controls")({
  component: DataControlsLayout,
});

function DataControlsLayout() {
  return (
    <PageContainer
      title="Data Controls"
      showTitle={false}
      centeredMaxWidth
      leftSection={<DataControlsTabs />}
    >
      <Outlet />
    </PageContainer>
  );
}
