import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { useDebounceCallback } from "usehooks-ts";
import { toast } from "sonner";
import { IconPlayerPlay } from "@tabler/icons-react";
import { Button, cn } from "@vmem/ui";
import type { WikiNodeDoc } from "./-types";
import { formatWikiDocForClipboard, type OutlineHeading } from "./_utils";
import { useWikiAutosave } from "./useWikiAutosave";

interface WikiArtifactEditorProps {
  doc: WikiNodeDoc;
  titleForCopy: string;
  onRegisterCopy: (handler: (() => Promise<void>) | null) => void;
  onRegisterRestore: (
    handler: ((source: string) => Promise<void>) | null,
  ) => void;
  onHeadingsChange: (headings: OutlineHeading[]) => void;
  onActiveHeadingChange: (id: string | null) => void;
  onWordCountChange: (count: number) => void;
}

function isPreviewableLanguage(language: string | undefined): boolean {
  return language === "html" || language === "svg";
}

function previewSrcDoc(content: string, language: string | undefined): string {
  if (language === "svg") {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0">${content}</body></html>`;
  }
  return content;
}

function PersonalPreviewActions({
  armed,
  onArm,
  onDisarm,
}: {
  armed: boolean;
  onArm: () => void;
  onDisarm: () => void;
}) {
  if (armed) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={onDisarm}>
        Hide preview
      </Button>
    );
  }
  return (
    <Button type="button" size="sm" variant="outline" onClick={onArm}>
      Show preview
    </Button>
  );
}

function TeamPreviewActions({
  armed,
  onArm,
  onDisarm,
}: {
  armed: boolean;
  onArm: () => void;
  onDisarm: () => void;
}) {
  if (!armed) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={onArm}>
        <IconPlayerPlay size={14} />
        Run preview
      </Button>
    );
  }
  return (
    <Button type="button" size="sm" variant="ghost" onClick={onDisarm}>
      Hide preview
    </Button>
  );
}

function ArtifactLivePreview({
  content,
  language,
}: {
  content: string;
  language: string | undefined;
}) {
  const deferredContent = useDeferredValue(content);
  const isStale = deferredContent !== content;

  return (
    <div
      className={cn(
        "min-h-[220px] min-w-0 flex-1 overflow-hidden bg-surface-secondary md:min-h-0",
        isStale ? "opacity-70" : null,
      )}
    >
      <iframe
        title="Artifact preview"
        sandbox="allow-scripts"
        srcDoc={previewSrcDoc(deferredContent, language)}
        className="h-full w-full border-0 bg-white"
      />
    </div>
  );
}

export default function WikiArtifactEditor({
  doc,
  titleForCopy,
  onRegisterCopy,
  onRegisterRestore,
  onHeadingsChange,
  onActiveHeadingChange,
  onWordCountChange,
}: WikiArtifactEditorProps) {
  const { queueSave, saveNow, cancelPendingSave } = useWikiAutosave(doc._id);

  // remount via key={doc._id} from parent resets draft / preview armed state
  const [draft, setDraft] = useState(() => doc.content ?? "");
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const isTeam = doc.teamId !== undefined;
  const canPreview = isPreviewableLanguage(doc.language);
  const [previewArmed, setPreviewArmed] = useState(() => !isTeam);

  useEffect(() => {
    onHeadingsChange([]);
    onActiveHeadingChange(null);
    onWordCountChange(0);
  }, [onHeadingsChange, onActiveHeadingChange, onWordCountChange]);

  useEffect(() => {
    onRegisterCopy(async () => {
      const text = formatWikiDocForClipboard(titleForCopy, draftRef.current);
      if (text.length === 0) {
        toast.error("Nothing to copy");
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
      } catch {
        toast.error("Failed to copy to clipboard");
      }
    });
    return () => onRegisterCopy(null);
  }, [onRegisterCopy, titleForCopy]);

  const restoreToContent = useCallback(
    async (source: string) => {
      cancelPendingSave();
      setDraft(source);
      try {
        await saveNow({
          content: source,
          contentText: source,
          forceSnapshot: true,
        });
        toast.success("Restored");
      } catch {
        // saveNow already toasts on failure
      }
    },
    [cancelPendingSave, saveNow],
  );

  useEffect(() => {
    onRegisterRestore(restoreToContent);
    return () => onRegisterRestore(null);
  }, [onRegisterRestore, restoreToContent]);

  function handleChange(next: string) {
    setDraft(next);
    queueSave({ content: next, contentText: next });
  }

  const showPreview = canPreview && previewArmed;
  const languageLabel = doc.language ?? (canPreview ? "html" : "text");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {canPreview ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-separator px-3 py-2 md:px-6">
          <span className="text-xs text-muted">
            {languageLabel}
            {isTeam ? " · team artifact" : null}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {isTeam ? (
              <TeamPreviewActions
                armed={previewArmed}
                onArm={() => setPreviewArmed(true)}
                onDisarm={() => setPreviewArmed(false)}
              />
            ) : (
              <PersonalPreviewActions
                armed={previewArmed}
                onArm={() => setPreviewArmed(true)}
                onDisarm={() => setPreviewArmed(false)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="shrink-0 px-3 py-2 text-xs text-muted md:px-6">
          {languageLabel}
        </div>
      )}

      <div
        className={cn(
          "flex min-h-0 flex-1",
          showPreview ? "flex-col md:flex-row" : "flex-col",
        )}
      >
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-hidden",
            showPreview ? "md:border-r md:border-separator" : null,
          )}
        >
          <textarea
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            spellCheck={false}
            className="h-full min-h-[280px] w-full resize-none bg-transparent px-3 py-4 font-mono text-[13px] leading-relaxed text-foreground outline-none md:px-6 md:py-6"
            aria-label="Artifact source"
          />
        </div>

        {showPreview ? (
          <ArtifactLivePreview content={draft} language={doc.language} />
        ) : null}
      </div>
    </div>
  );
}
