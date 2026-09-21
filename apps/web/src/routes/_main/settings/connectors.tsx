import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { ConnectorsClient } from "@/components/settings/ConnectorsClient";
import { WorkspaceEntryRedirect } from "@/components/workspace/WorkspaceEntryRedirect";

// Seed-on-visit stays in this grandfathered file (useEffect allowlist).
// Sources → Connectors renders `ConnectorsScreen`; this route only redirects.
export function ConnectorsScreen() {
  const connectors = useQuery(api.connectors.crud.listMy);
  const seedDefaults = useMutation(api.connectors.crud.seedDefaults);
  const seededRef = useRef(false);

  useEffect(() => {
    if (connectors !== undefined && !seededRef.current) {
      seededRef.current = true;
      void seedDefaults();
    }
  }, [connectors, seedDefaults]);

  return <ConnectorsClient connectors={connectors} />;
}

export const Route = createFileRoute("/_main/settings/connectors")({
  component: ConnectorsRedirect,
});

function ConnectorsRedirect() {
  return <WorkspaceEntryRedirect subPath="/sources/connectors" />;
}
