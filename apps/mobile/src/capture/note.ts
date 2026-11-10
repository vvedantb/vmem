import type {
  QueueItemInput,
  RawEvent,
} from "../../modules/vmem-tracker/src/api";
import { hash53, truncate, utcStamp } from "./format";
import { memoryBody } from "./memory";

const MAX_TITLE_CHARS = 80;

function firstLine(text: string): string {
  return (
    text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? text
  ).trim();
}

interface TextCapture {
  kind: "note" | "clipboard";
  source: "android-note" | "android-clipboard";
  titlePrefix: string;
  intro: string;
}

const NOTE: TextCapture = {
  kind: "note",
  source: "android-note",
  titlePrefix: "Note",
  intro: "Note written in vmem on Android",
};
const CLIPBOARD: TextCapture = {
  kind: "clipboard",
  source: "android-clipboard",
  titlePrefix: "Clipboard",
  intro: "Clipboard saved to vmem on Android",
};

function textItem(spec: TextCapture, event: RawEvent): QueueItemInput | null {
  const text = event.text?.trim() ?? "";
  if (event.kind !== spec.kind || text.length === 0) return null;
  // The same text saved twice updates one memory.
  const externalId = `android:${spec.kind}:${hash53(text)}`;
  const body = memoryBody({
    title: `${spec.titlePrefix}: ${truncate(firstLine(text), MAX_TITLE_CHARS)}`,
    content: `${text}\n\n${spec.intro} at ${utcStamp(event.startMs)} UTC.`,
    tags: [spec.kind],
    externalId,
    source: spec.source,
  });
  return {
    kind: spec.kind,
    externalId,
    body: JSON.stringify(body),
    startMs: event.startMs,
    endMs: event.endMs,
  };
}

/** One review item per quick note. Empty notes make no item. */
export const noteItem = (event: RawEvent) => textItem(NOTE, event);

/** One review item per saved clipboard. Redact before inserting the event. */
export const clipboardItem = (event: RawEvent) => textItem(CLIPBOARD, event);
