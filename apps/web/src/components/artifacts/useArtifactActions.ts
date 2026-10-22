import { useConvex, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@vmem/backend";

// rename, delete (soft, with an Undo toast that restores from the trash) and
// body loading, shared by the list cards and the viewer
export function useArtifactActions() {
  const convex = useConvex();
  const update = useMutation(api.artifacts.api.update);
  const remove = useMutation(api.artifacts.api.remove);
  const restore = useMutation(api.artifacts.api.restore);

  const rename = async (id: string, title: string) => {
    await update({ id, title });
  };

  const restoreArtifact = async (id: string) => {
    try {
      await restore({ id });
      toast.success("Artifact restored");
    } catch {
      toast.error("Couldn't restore artifact");
    }
  };

  const deleteArtifact = async (id: string) => {
    await remove({ id });
    toast.success("Artifact moved to trash", {
      action: { label: "Undo", onClick: () => void restoreArtifact(id) },
    });
  };

  // list rows carry no body, so Copy and Download fetch it once
  const getBody = async (id: string) => {
    const detail = await convex.query(api.artifacts.api.get, { id });
    if (!detail) throw new Error("Artifact not found");
    return detail.body;
  };

  return { rename, deleteArtifact, restoreArtifact, getBody };
}
