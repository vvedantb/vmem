import { useEffect } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { buildTree, findFirstDocumentId } from "@/components/wiki/_utils";

// empty /wiki or folder id → first doc (replace)
export function WikiDocRouteRedirect() {
  const navigate = useNavigate();
  const activeProfile = useActiveProfile();
  const params = useParams({ strict: false });
  const docId = typeof params.docId === "string" ? params.docId : null;
  const nodes = useQuery(api.wiki.listTree, { teamId: activeProfile.teamId });
  const tree = nodes ? buildTree(nodes) : [];

  useEffect(() => {
    if (!nodes) return;

    // keep document/artifact URLs; only redirect bare /wiki or folder ids
    if (docId !== null) {
      const node = nodes.find((n) => n._id === docId);
      if (!node || node.kind === "document" || node.kind === "artifact") return;
    }

    const firstId = findFirstDocumentId(tree);
    if (firstId === null || firstId === docId) return;

    void navigate({
      to: "/$profileId/wiki/$docId",
      params: { profileId: activeProfile._id, docId: firstId },
      replace: true,
    });
  }, [nodes, docId, tree, navigate, activeProfile._id]);

  return null;
}
