import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@vmem/backend";
import { parseConvexStorageUpload } from "@/lib/schemas";
import { useActiveProfile } from "@/components/workspace/active-profile";

const DEFAULT_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024;

function collectFileSubtreeIds(
  nodes: Array<{ _id: Id<"fileNodes">; parentId?: Id<"fileNodes"> }>,
  rootIds: Iterable<Id<"fileNodes">>,
): Set<Id<"fileNodes">> {
  const childrenByParent = new Map<string, Id<"fileNodes">[]>();
  for (const node of nodes) {
    const key = node.parentId ?? "__root__";
    const list = childrenByParent.get(key) ?? [];
    list.push(node._id);
    childrenByParent.set(key, list);
  }
  const result = new Set<Id<"fileNodes">>();
  const stack: Id<"fileNodes">[] = [...rootIds];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || result.has(current)) continue;
    result.add(current);
    for (const child of childrenByParent.get(current) ?? []) {
      stack.push(child);
    }
  }
  return result;
}

// files data layer bound directly to the live Convex `files.listTree` query
export function useFilesData() {
  const teamId = useActiveProfile().teamId;
  const data = useQuery(api.files.listTree, { teamId });
  const nodes = data?.nodes ?? [];

  const generateUploadUrl = useMutation(api.files.generateFileUploadUrl);
  const createFileMutation = useMutation(
    api.files.createFile,
  ).withOptimisticUpdate((localStore, args) => {
    const treeArgs = { teamId: args.teamId };
    const tree = localStore.getQuery(api.files.listTree, treeArgs);
    if (tree === undefined) return;
    const now = Date.now();
    const tempId = crypto.randomUUID() as Id<"fileNodes">;
    localStore.setQuery(api.files.listTree, treeArgs, {
      ...tree,
      totalBytes: tree.totalBytes + args.size,
      nodes: [
        ...tree.nodes,
        {
          _id: tempId,
          _creationTime: now,
          userId: tree.nodes[0]?.userId ?? ("" as Id<"users">),
          teamId: args.teamId,
          parentId: args.parentId,
          kind: "file" as const,
          name: args.name,
          mimeType: args.mimeType,
          size: args.size,
          storageId: args.storageId,
          indexStatus: "pending" as const,
          createdAt: now,
          updatedAt: now,
          url: null,
        },
      ],
    });
  });
  const createFolderMutation = useMutation(
    api.files.createFolder,
  ).withOptimisticUpdate((localStore, args) => {
    const treeArgs = { teamId: args.teamId };
    const tree = localStore.getQuery(api.files.listTree, treeArgs);
    if (tree === undefined) return;
    const now = Date.now();
    const tempId = crypto.randomUUID() as Id<"fileNodes">;
    localStore.setQuery(api.files.listTree, treeArgs, {
      ...tree,
      nodes: [
        ...tree.nodes,
        {
          _id: tempId,
          _creationTime: now,
          userId: tree.nodes[0]?.userId ?? ("" as Id<"users">),
          teamId: args.teamId,
          parentId: args.parentId,
          kind: "folder" as const,
          name: args.name,
          createdAt: now,
          updatedAt: now,
          url: null,
        },
      ],
    });
  });
  const renameMutation = useMutation(api.files.renameNode).withOptimisticUpdate(
    (localStore, args) => {
      for (const entry of localStore.getAllQueries(api.files.listTree)) {
        if (entry.value === undefined) continue;
        localStore.setQuery(api.files.listTree, entry.args, {
          ...entry.value,
          nodes: entry.value.nodes.map((n) =>
            n._id === args.nodeId
              ? { ...n, name: args.name, updatedAt: Date.now() }
              : n,
          ),
        });
      }
    },
  );
  const moveMutation = useMutation(api.files.moveNodes).withOptimisticUpdate(
    (localStore, args) => {
      const moveSet = new Set(args.nodeIds);
      for (const entry of localStore.getAllQueries(api.files.listTree)) {
        if (entry.value === undefined) continue;
        localStore.setQuery(api.files.listTree, entry.args, {
          ...entry.value,
          nodes: entry.value.nodes.map((n) =>
            moveSet.has(n._id)
              ? {
                  ...n,
                  parentId: args.targetParentId,
                  updatedAt: Date.now(),
                }
              : n,
          ),
        });
      }
    },
  );
  const deleteMutation = useMutation(
    api.files.deleteNodes,
  ).withOptimisticUpdate((localStore, args) => {
    for (const entry of localStore.getAllQueries(api.files.listTree)) {
      if (entry.value === undefined) continue;
      const remove = collectFileSubtreeIds(entry.value.nodes, args.nodeIds);
      let subtract = 0;
      for (const n of entry.value.nodes) {
        if (remove.has(n._id) && n.kind === "file" && n.size !== undefined) {
          subtract += n.size;
        }
      }
      localStore.setQuery(api.files.listTree, entry.args, {
        ...entry.value,
        totalBytes: Math.max(0, entry.value.totalBytes - subtract),
        nodes: entry.value.nodes.filter((n) => !remove.has(n._id)),
      });
    }
  });

  const toNodeId = (
    id: Id<"fileNodes"> | null,
  ): Id<"fileNodes"> | undefined => {
    if (id === null) return undefined;
    return nodes.find((node) => node._id === id)?._id;
  };

  const toNodeIds = (ids: Array<Id<"fileNodes">>): Array<Id<"fileNodes">> => {
    const wanted = new Set(ids);
    return nodes.filter((node) => wanted.has(node._id)).map((node) => node._id);
  };

  const uploadFile = async (
    file: File,
    parentFolderId: Id<"fileNodes"> | null,
  ): Promise<void> => {
    const uploadUrl = await generateUploadUrl();
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
    const storageId = parseConvexStorageUpload(await response.json());
    if (!storageId) {
      throw new Error("Invalid upload response from storage");
    }
    await createFileMutation({
      name: file.name,
      parentId: toNodeId(parentFolderId),
      storageId,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      teamId,
    });
  };

  const createFolder = async (
    name: string,
    parentFolderId: Id<"fileNodes"> | null,
  ): Promise<void> => {
    await createFolderMutation({
      name,
      parentId: toNodeId(parentFolderId),
      teamId,
    });
  };

  const renameNode = async (
    id: Id<"fileNodes">,
    name: string,
  ): Promise<void> => {
    const nodeId = toNodeId(id);
    if (!nodeId) return;
    await renameMutation({ nodeId, name });
  };

  const moveNodes = async (
    ids: Array<Id<"fileNodes">>,
    targetFolderId: Id<"fileNodes"> | null,
  ): Promise<void> => {
    await moveMutation({
      nodeIds: toNodeIds(ids),
      targetParentId: toNodeId(targetFolderId),
    });
  };

  const deleteNodes = async (ids: Array<Id<"fileNodes">>): Promise<void> => {
    await deleteMutation({ nodeIds: toNodeIds(ids) });
  };

  return {
    nodes,
    isLoading: data === undefined,
    totalBytes: data?.totalBytes ?? 0,
    storageLimit: data?.storageLimit ?? DEFAULT_STORAGE_LIMIT,
    uploadFile,
    createFolder,
    renameNode,
    moveNodes,
    deleteNodes,
  };
}

export type UseFilesDataResult = ReturnType<typeof useFilesData>;
