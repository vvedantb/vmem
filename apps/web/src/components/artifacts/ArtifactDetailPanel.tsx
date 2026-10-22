import { Link, useNavigate } from "@tanstack/react-router";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useQueryStates } from "nuqs";
import { toast } from "sonner";
import { IconArrowLeft, IconLink, IconTrash } from "@tabler/icons-react";
import {
  ArtifactViewer,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  Spinner,
} from "@vvedantb/ui";
import { api } from "@vmem/backend";
import { convexErrorMessage } from "@/lib/convex-error";
import { artifactViewerSearchParams } from "@/lib/url-state/artifacts";
import {
  artifactRefLabel,
  createArtifactStateStore,
  sortArtifactRefs,
  toVersionSummaries,
  type ArtifactRef,
} from "./_artifactsUtils";
import { useArtifactActions } from "./useArtifactActions";

// the ArtifactFrame state adapter on getState/putState. Kept per artifact id:
// a new store object reloads the frame.
function useArtifactStateStore(id: string) {
  const convex = useConvex();
  const putState = useMutation(api.artifacts.api.putState);
  return createArtifactStateStore({
    load: () => convex.query(api.artifacts.api.getState, { id }),
    put: (patch) => putState({ id, ...patch }),
    onError: (error, phase) =>
      toast.error(
        phase === "load" ? "Couldn't load saved state" : "Couldn't save state",
        { description: convexErrorMessage(error, "Try again shortly.") },
      ),
  });
}

// `/artifacts/$artifactId`: one artifact in the shared viewer. Bodies render
// only through ArtifactViewer (sandboxed frame, markdown or code).
export function ArtifactDetailPanel({
  profileId,
  artifactId,
}: {
  profileId: string;
  artifactId: string;
}) {
  const navigate = useNavigate();
  const [{ v }, setViewer] = useQueryStates(artifactViewerSearchParams);
  const actions = useArtifactActions();
  const restoreVersion = useMutation(api.artifacts.api.restoreVersion);
  const store = useArtifactStateStore(artifactId);

  const current = useQuery(api.artifacts.api.get, { id: artifactId });
  const live = current ? { id: artifactId } : "skip";
  const history = useQuery(api.artifacts.api.history, live);
  const refs = useQuery(api.artifacts.api.refs, live);
  const olderVersion =
    current && v !== null && v !== current.currentVersion ? v : undefined;
  const older = useQuery(
    api.artifacts.api.getVersion,
    olderVersion !== undefined
      ? { id: artifactId, version: olderVersion }
      : "skip",
  );

  if (
    current === undefined ||
    (olderVersion !== undefined && older === undefined)
  ) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (current === null) {
    return (
      <EmptyState.Root className="flex-1">
        <EmptyState.Title>Artifact not found</EmptyState.Title>
        <EmptyState.Description>
          It may have been purged from the trash, or you no longer have access.
        </EmptyState.Description>
        <EmptyState.Actions>
          <Button asChild variant="secondary" size="sm">
            <Link to="/$profileId/artifacts" params={{ profileId }}>
              All artifacts
            </Link>
          </Button>
        </EmptyState.Actions>
      </EmptyState.Root>
    );
  }

  // a pruned version reads as null: fall back to the current one
  const shown = older ?? current;
  const inTrash = current.deletedAt !== undefined;

  const backToList = () =>
    void navigate({ to: "/$profileId/artifacts", params: { profileId } });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {inTrash ? (
        <div className="flex items-center justify-between gap-3 rounded-surface bg-surface-secondary px-4 py-2 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <IconTrash size={16} aria-hidden />
            This artifact is in the trash. It is purged 30 days after delete.
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void actions.restoreArtifact(artifactId)}
          >
            Restore
          </Button>
        </div>
      ) : null}
      <ArtifactViewer
        artifact={shown}
        // deleted rows reject state writes, so a trashed artifact keeps none
        store={inTrash ? undefined : store}
        versions={
          history ? toVersionSummaries(history, current.title) : undefined
        }
        viewingVersion={shown.version}
        onViewVersion={(version) =>
          void setViewer({
            v: version === current.currentVersion ? null : version,
          })
        }
        onRestoreVersion={
          inTrash
            ? undefined
            : async (version) => {
                await restoreVersion({ id: artifactId, version });
                await setViewer({ v: null });
              }
        }
        href={`/${profileId}/artifacts/${artifactId}`}
        headerStart={
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            aria-label="All artifacts"
          >
            <Link to="/$profileId/artifacts" params={{ profileId }}>
              <IconArrowLeft size={16} />
            </Link>
          </Button>
        }
        actions={
          refs && refs.length > 0 ? (
            <ArtifactLinksMenu refs={refs} profileId={profileId} />
          ) : undefined
        }
        onRename={
          inTrash ? undefined : (title) => actions.rename(artifactId, title)
        }
        onDelete={
          inTrash
            ? undefined
            : async () => {
                await actions.deleteArtifact(artifactId);
                backToList();
              }
        }
      />
    </div>
  );
}

// what the artifact links to (artifactRefs); memory refs open the memory
function ArtifactLinksMenu({
  refs,
  profileId,
}: {
  refs: readonly ArtifactRef[];
  profileId: string;
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Linked"
          startContent={<IconLink size={16} />}
        >
          {refs.length}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        fitViewport
        suppressAltKey
        restoreScrollLockOnClose
        align="end"
        className="max-w-80"
      >
        <DropdownMenuLabel>Linked</DropdownMenuLabel>
        {sortArtifactRefs(refs).map((ref) =>
          ref.kind === "memory" ? (
            <DropdownMenuItem
              key={`${ref.kind}:${ref.target}`}
              description={ref.target}
              onClick={() =>
                void navigate({
                  to: "/$profileId/memories/list/$id",
                  params: { profileId, id: ref.target },
                })
              }
            >
              {artifactRefLabel(ref)}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={`${ref.kind}:${ref.target}`}
              disabled
              description={ref.target}
            >
              {artifactRefLabel(ref)}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
