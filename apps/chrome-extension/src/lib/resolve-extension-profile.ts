type ProfileLike = {
  _id: string;
  isDefault: boolean;
};

// storage override, then convex extension default, then account default
export function resolveExtensionProfileId(params: {
  storageProfileId: string;
  convexExtensionDefaultId: string | null | undefined;
  profiles: ProfileLike[] | undefined;
}): string {
  const { storageProfileId, convexExtensionDefaultId, profiles } = params;

  if (
    storageProfileId &&
    profiles?.some((profile) => profile._id === storageProfileId)
  ) {
    return storageProfileId;
  }

  if (
    convexExtensionDefaultId &&
    profiles?.some((profile) => profile._id === convexExtensionDefaultId)
  ) {
    return convexExtensionDefaultId;
  }

  return profiles?.find((profile) => profile.isDefault)?._id ?? "";
}
