const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "twclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "ref",
  "source",
  "referrer",
  "_ga",
  "_gl",
  "sessionid",
  "session_id",
  "trk",
  "tracking",
  "affiliate",
  "aff_id",
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

  url.pathname = url.pathname.replace(/\/+$/, "") || "/";

  return url.toString();
}
