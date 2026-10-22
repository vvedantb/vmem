import { useNavigate } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useQueryStates } from "nuqs";
import {
  ArtifactList,
  ArtifactListToolbar,
  Button,
  Spinner,
  type ArtifactSummary,
} from "@vvedantb/ui";
import { api, type Id } from "@vmem/backend";
import { artifactsSearchParams } from "@/lib/url-state/artifacts";
import { useArtifactActions } from "./useArtifactActions";

const PAGE_SIZE = 50;

// `/artifacts` list: paged metadata rows, or full-text search results (top 20)
// while the search box has text. Personal profiles list personal artifacts;
// team profiles list the team's.
export function ArtifactsPanel({
  profileId,
  teamId,
}: {
  profileId: string;
  teamId: Id<"teams"> | undefined;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useQueryStates(artifactsSearchParams);
  const actions = useArtifactActions();
  const query = params.q.trim();
  const type = params.type ?? undefined;
  const searching = query.length > 0;

  const paged = usePaginatedQuery(
    api.artifacts.api.list,
    searching ? "skip" : { teamId, type },
    { initialNumItems: PAGE_SIZE },
  );
  const searched = useQuery(
    api.artifacts.api.search,
    searching ? { q: query, type, teamId } : "skip",
  );
  const rows = searching
    ? searched
    : paged.status === "LoadingFirstPage"
      ? undefined
      : paged.results;

  const open = (artifact: ArtifactSummary) =>
    void navigate({
      to: "/$profileId/artifacts/$artifactId",
      params: { profileId, artifactId: artifact.id },
    });

  return (
    <section className="flex flex-col gap-4">
      <ArtifactListToolbar
        query={params.q}
        onQueryChange={(q) => void setParams({ q })}
        type={type}
        onTypeChange={(next) => void setParams({ type: next ?? null })}
        layout={params.layout}
        onLayoutChange={(layout) => void setParams({ layout })}
      />

      {rows === undefined ? (
        <div className="flex min-h-40 items-center justify-center">
          <Spinner size="sm" />
        </div>
      ) : (
        <ArtifactList
          artifacts={rows}
          layout={params.layout}
          onOpen={open}
          getHref={(artifact) => `/${profileId}/artifacts/${artifact.id}`}
          getBody={(artifact) => actions.getBody(artifact.id)}
          onRename={(artifact, title) => actions.rename(artifact.id, title)}
          onDelete={(artifact) => actions.deleteArtifact(artifact.id)}
          emptyTitle={
            searching || type
              ? "No matching artifacts"
              : teamId
                ? "No team artifacts yet"
                : "No artifacts yet"
          }
          emptyDescription={
            searching || type
              ? "Try another search or type."
              : "Documents, reports, quizzes and other artifacts saved through MCP (artifacts_save) or connected apps show up here."
          }
        />
      )}

      {!searching &&
      (paged.status === "CanLoadMore" || paged.status === "LoadingMore") ? (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={paged.status === "LoadingMore"}
            onClick={() => paged.loadMore(PAGE_SIZE)}
          >
            {paged.status === "LoadingMore" ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
