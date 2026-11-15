// Profile fields for a Dream Mode portrait that is never due. Convex tests
// of the other Dream steps patch them onto a profile, so those runs make no
// portrait call and their AI call counts stay exact.
export const CURRENT_PORTRAIT = {
  dreamPortrait: "The user tests vmem.",
  dreamPortraitUpdatedAt: Number.MAX_SAFE_INTEGER,
};
