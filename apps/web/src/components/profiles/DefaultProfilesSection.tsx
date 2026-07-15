import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@vmem/ui";
import { IconBrandChrome } from "@tabler/icons-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";

type Profile = FunctionReturnType<typeof api.profiles.list>[number];

export function DefaultProfilesSection({ profiles }: { profiles: Profile[] }) {
  const settings = useQuery(api.userSettings.get);
  const setDefaultProfile = useMutation(
    api.userSettings.setDefaultProfile,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.userSettings.get, {});
    if (!current) return;
    const defaults = current.defaultProfiles ?? {};
    localStore.setQuery(
      api.userSettings.get,
      {},
      {
        ...current,
        defaultProfiles: { ...defaults, [args.source]: args.profileId },
      },
    );
  });

  const extensionDefaultId = settings?.defaultProfiles?.extension ?? null;

  const defaultProfile = profiles.find((p) => p.isDefault);
  const extensionDefault =
    profiles.find((p) => p._id === extensionDefaultId) ?? defaultProfile;

  const handleDefaultProfileChange = async (profileId: Profile["_id"]) => {
    try {
      await setDefaultProfile({
        source: "extension",
        profileId,
      });
      toast.success("Saved!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-medium text-foreground text-balance">
          Default Profiles
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          Choose which profile new memories are saved to by default. In the web
          app, memories save to the active workspace.
        </p>
      </div>

      <Card className="shadow-none">
        <CardContent className="space-y-4 p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <IconBrandChrome className="h-4 w-4 text-muted" />
                <Label className="text-sm">Browser Extension</Label>
              </div>
              <Select
                value={extensionDefault?._id ?? ""}
                onValueChange={(value) => {
                  const profile = profiles.find((p) => p._id === value);
                  if (profile) void handleDefaultProfileChange(profile._id);
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue>
                    {extensionDefault && (
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: extensionDefault.color }}
                        />
                        <span className="truncate">
                          {extensionDefault.name}
                        </span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile._id} value={profile._id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: profile.color }}
                        />
                        <span>{profile.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted pt-1">
              MCP clients will ask which profile to save to
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
