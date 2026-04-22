import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useQueryStates } from "nuqs";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import {
  Breadcrumb,
  BreadcrumbLink,
  BreadcrumbPage,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@vmem/ui";
import { IconArrowLeft, IconLoader2 } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { teamRouteSearchParams } from "./-searchParams";
import { TeamOverview } from "./_components/TeamOverview";
import { TeamKnowledge } from "./_components/TeamKnowledge";
import { TeamMembers } from "./_components/TeamMembers";
import { TeamSettings } from "./_components/TeamSettings";

export const Route = createFileRoute("/_main/teams/$teamId/")({
  component: TeamDetailPage,
});

export type TeamDetail = NonNullable<FunctionReturnType<typeof api.teams.get>>;

function TeamDetailPage() {
  const { teamId } = Route.useParams();
  const [params, setParams] = useQueryStates(teamRouteSearchParams);
  const data = useQuery(api.teams.get, { teamId });

  if (data === undefined) {
    return (
      <PageContainer title="Team">
        <div className="flex items-center justify-center py-20">
          <IconLoader2
            size={20}
            className="animate-spin text-muted-foreground"
          />
        </div>
      </PageContainer>
    );
  }

  if (data === null) {
    return (
      <PageContainer title="Team">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            Team not found or you&apos;re not a member.
          </p>
          <Link to="/teams">
            <Button variant="outline" size="sm">
              <IconArrowLeft size={16} />
              Back to teams
            </Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  return <TeamDetailView data={data} params={params} setParams={setParams} />;
}

type SetParams = ReturnType<
  typeof useQueryStates<typeof teamRouteSearchParams>
>[1];

function TeamDetailView({
  data,
  params,
  setParams,
}: {
  data: TeamDetail;
  params: ReturnType<typeof useQueryStates<typeof teamRouteSearchParams>>[0];
  setParams: SetParams;
}) {
  const isOwner = data.role === "owner";

  return (
    <PageContainer
      title={data.team.name}
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbLink asChild>
            <Link to="/teams">Teams</Link>
          </BreadcrumbLink>
          <BreadcrumbPage>{data.team.name}</BreadcrumbPage>
        </Breadcrumb>
      }
      centerSection={
        <Tabs
          value={params.tab}
          onValueChange={(v) => {
            // parseAsStringLiteral guarantees the value type; cast-free via setParams.
            // shallow: true prevents router navigation, avoiding parent re-renders
            // that would flash the loading state.
            if (
              v === "overview" ||
              v === "knowledge" ||
              v === "members" ||
              v === "settings"
            ) {
              void setParams({ tab: v }, { shallow: true });
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            {isOwner && <TabsTrigger value="settings">Settings</TabsTrigger>}
          </TabsList>
        </Tabs>
      }
    >
      <Tabs value={params.tab} className="flex flex-1 flex-col">
        <TabsContent value="overview" className="mt-0">
          <TeamOverview data={data} />
        </TabsContent>
        <TabsContent value="knowledge" className="mt-0">
          <TeamKnowledge data={data} />
        </TabsContent>
        <TabsContent value="members" className="mt-0">
          <TeamMembers data={data} />
        </TabsContent>
        {isOwner && (
          <TabsContent value="settings" className="mt-0">
            <TeamSettings data={data} />
          </TabsContent>
        )}
      </Tabs>
    </PageContainer>
  );
}
