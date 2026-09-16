import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { ConnectorsClient } from "@/components/settings/ConnectorsClient";

export const Route = createFileRoute("/_main/settings/connectors")({
  component: ConnectorsRoute,
});

function ConnectorsRoute() {
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
