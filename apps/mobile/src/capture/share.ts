import type {
  QueueItemInput,
  RawEvent,
} from "../../modules/vmem-tracker/src/api";
import { hash53, truncate, utcStamp } from "./format";
import { memoryBody } from "./memory";

const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;
const MAX_TITLE_CHARS = 120;
const MAX_URL_CHARS = 2048;

/** Same text shared twice (on any phone) updates one memory. */
export function shareExternalId(text: string): string {
  return `android:share:${hash53(text)}`;
}

export function firstUrl(text: string): string | null {
  const match = URL_PATTERN.exec(text);
  const url = match?.[0]?.replace(/[).,;!?]+$/, "");
  return url && url.length <= MAX_URL_CHARS ? url : null;
}

function linkTitle(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return `Shared link: ${truncate(withoutScheme, MAX_TITLE_CHARS - 13)}`;
}

/**
 * The title: the share subject, else "Shared link: host/path" when the
 * text is only a link, else the first line of the text.
 */
export function shareTitle(
  text: string,
  subject: string | null,
  url: string | null,
): string {
  if (subject) return truncate(subject, MAX_TITLE_CHARS);
  if (url && text.trim() === url) return linkTitle(url);
  const firstLine =
    text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? text;
  return truncate(firstLine.trim(), MAX_TITLE_CHARS);
}

/** One review item per share. Text is stored as shared: the user chose it. */
export function shareItem(event: RawEvent): QueueItemInput | null {
  const text = event.text?.trim() ?? "";
  if (event.kind !== "share" || text.length === 0) return null;
  const url = firstUrl(text);
  const from = event.label ? ` from ${event.label}` : "";
  const externalId = shareExternalId(text);
  const body = memoryBody({
    title: shareTitle(text, event.subject, url),
    content: `${text}\n\nShared to vmem${from} on Android at ${utcStamp(event.startMs)} UTC.`,
    tags: url ? ["share", "link"] : ["share"],
    externalId,
    ...(url ? { url } : {}),
  });
  return {
    kind: "share",
    externalId,
    body: JSON.stringify(body),
    startMs: event.startMs,
    endMs: event.endMs,
  };
}
