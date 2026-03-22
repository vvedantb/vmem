const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

export function normalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  const cleaned = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (!TRACKING_PARAMS.has(key.toLowerCase())) {
      cleaned.set(key, value);
    }
  });
  url.search = cleaned.toString();

  let path = url.pathname.replace(/\/+$/, "");
  if (path === "") path = "/";
  url.pathname = path;

  return url.toString();
}
