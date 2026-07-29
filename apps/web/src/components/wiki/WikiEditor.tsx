import { Spinner } from "@vmem/ui";
import type { OutlineHeading } from "./_utils";
import type { WikiNodeDoc } from "./-types";
import WikiArtifactEditor from "./WikiArtifactEditor";
import WikiDocumentEditor from "./WikiDocumentEditor";

interface WikiEditorProps {
  doc: WikiNodeDoc | null | undefined;
  titleForCopy: string;
  onRegisterCopy: (handler: (() => Promise<void>) | null) => void;
  onRegisterRestore: (
    handler: ((markdown: string) => Promise<void>) | null,
  ) => void;
  onHeadingsChange: (headings: OutlineHeading[]) => void;
  onActiveHeadingChange: (id: string | null) => void;
  onWordCountChange: (count: number) => void;
  jumpRequest: { pos: number; n: number };
}

// routes to TipTap (documents) or artifact source/preview editor.
// keeps TipTap off the artifact path so code/html nodes do not mount it
export default function WikiEditor({
  doc,
  titleForCopy,
  onRegisterCopy,
  onRegisterRestore,
  onHeadingsChange,
  onActiveHeadingChange,
  onWordCountChange,
  jumpRequest,
}: WikiEditorProps) {
  if (doc === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">Document not found.</p>
      </div>
    );
  }

  if (doc.kind === "artifact") {
    return (
      <WikiArtifactEditor
        key={doc._id}
        doc={doc}
        titleForCopy={titleForCopy}
        onRegisterCopy={onRegisterCopy}
        onRegisterRestore={onRegisterRestore}
        onHeadingsChange={onHeadingsChange}
        onActiveHeadingChange={onActiveHeadingChange}
        onWordCountChange={onWordCountChange}
      />
    );
  }

  if (doc.kind === "folder") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">
          This is a folder. Select a document to edit.
        </p>
      </div>
    );
  }

  return (
    <WikiDocumentEditor
      doc={doc}
      titleForCopy={titleForCopy}
      onRegisterCopy={onRegisterCopy}
      onRegisterRestore={onRegisterRestore}
      onHeadingsChange={onHeadingsChange}
      onActiveHeadingChange={onActiveHeadingChange}
      onWordCountChange={onWordCountChange}
      jumpRequest={jumpRequest}
    />
  );
}
