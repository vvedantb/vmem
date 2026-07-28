import { useState } from "react";
import { parseEnvVars } from "@vmem/shared";
import { useCopyToClipboard, useTimeout } from "usehooks-ts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Spinner,
  Textarea,
  Card,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@vmem/ui";
import DestructiveConfirmDialog from "@/components/settings/DestructiveConfirmDialog";
import {
  IconCheck,
  IconClipboard,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconKey,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { useAsyncSubmit } from "@/hooks/useAsyncSubmit";

export interface EnvVar {
  key: string;
  value: string;
}

// unified add/edit row draft — `originalKey` set only when editing
type EnvVarDraft =
  | { mode: "add"; key: string; value: string }
  | { mode: "edit"; originalKey: string; key: string; value: string };

interface EnvVarsTableProps {
  vars: EnvVar[] | undefined;
  onUpsert: (key: string, value: string) => Promise<void>;
  onEdit: (oldKey: string, newKey: string, value?: string) => Promise<void>;
  onReveal: (key: string) => Promise<string | null>;
  onRemove: (key: string) => Promise<void>;
  onBulkImport: (
    entries: Array<{ key: string; value: string }>,
  ) => Promise<void>;
}

type EnvVarRowEditorProps = {
  draft: EnvVarDraft;
  saving: boolean;
  autoFocus?: boolean;
  onKeyChange: (key: string) => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onKeyPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  valuePlaceholder: string;
  saveDisabled: boolean;
};

function EnvVarRowEditor({
  draft,
  saving,
  autoFocus = false,
  onKeyChange,
  onValueChange,
  onSave,
  onCancel,
  onKeyPaste,
  valuePlaceholder,
  saveDisabled,
}: EnvVarRowEditorProps) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="px-2.5 py-2.5 sm:px-4">
        <Input
          value={draft.key}
          onChange={(e) => onKeyChange(e.target.value)}
          onPaste={onKeyPaste}
          placeholder={draft.mode === "add" ? "e.g. OPENROUTER_API_KEY" : "Key"}
          className="h-8 font-mono text-xs"
          autoFocus={autoFocus}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (draft.mode === "edit" && e.key === "Enter") onSave();
          }}
        />
      </TableCell>
      <TableCell className="px-2.5 py-2.5 sm:px-4">
        <Input
          value={draft.value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={valuePlaceholder}
          className="h-8 font-mono text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
        />
      </TableCell>
      <TableCell className="px-2.5 py-2.5 text-right sm:px-4">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onSave}
            disabled={saveDisabled || saving}
            title="Save"
            className="text-accent hover:text-accent"
          >
            <IconCheck className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onCancel}
            title="Cancel"
          >
            <IconX className="size-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function EnvVarsTable({
  vars,
  onUpsert,
  onEdit,
  onReveal,
  onRemove,
  onBulkImport,
}: EnvVarsTableProps) {
  const [draft, setDraft] = useState<EnvVarDraft | null>(null);

  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const { submitting: saving, run: runSave } = useAsyncSubmit();

  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {},
  );
  const [revealingKey, setRevealingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [, copyToClipboard] = useCopyToClipboard();

  useTimeout(() => setCopiedKey(null), copiedKey !== null ? 1500 : null);

  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const { submitting: bulkSaving, run: runBulkImport } = useAsyncSubmit();

  const sortedVars = (vars ?? [])
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key));
  const showTable = (vars && vars.length > 0) || draft !== null;

  const clearDraft = () => setDraft(null);

  const startAdd = () => {
    setDraft({ mode: "add", key: "", value: "" });
  };

  const startEdit = (entry: EnvVar) => {
    setDraft({
      mode: "edit",
      originalKey: entry.key,
      key: entry.key,
      value: "",
    });
  };

  const updateDraftKey = (key: string) => {
    setDraft((prev) => (prev === null ? prev : { ...prev, key }));
  };

  const updateDraftValue = (value: string) => {
    setDraft((prev) => (prev === null ? prev : { ...prev, value }));
  };

  const saveDraft = async () => {
    if (draft === null) return;

    if (draft.mode === "add") {
      if (!draft.key.trim() || !draft.value.trim()) return;
      await runSave(async () => {
        await onUpsert(draft.key.trim(), draft.value);
        clearDraft();
      }, "Failed to save");
      return;
    }

    if (!draft.key.trim()) return;
    const newKey = draft.key.trim();
    const newValue = draft.value.trim() ? draft.value : undefined;
    if (newKey === draft.originalKey && newValue === undefined) {
      clearDraft();
      return;
    }
    await runSave(async () => {
      await onEdit(draft.originalKey, newKey, newValue);
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[draft.originalKey];
        if (newKey !== draft.originalKey) delete next[newKey];
        return next;
      });
      clearDraft();
    }, "Failed to save");
  };

  const confirmDelete = async () => {
    if (!deleteKey) return;
    try {
      await onRemove(deleteKey);
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[deleteKey];
        return next;
      });
      setDeleteKey(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const toggleReveal = async (key: string) => {
    if (revealedValues[key] !== undefined) {
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setRevealingKey(key);
    try {
      const value = await onReveal(key);
      if (value !== null) {
        setRevealedValues((prev) => ({ ...prev, [key]: value }));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reveal value",
      );
    }
    // after the try rather than in a `finally` React Compiler bails on the
    // whole file when it meets one. The catch swallows, so this always runs.
    setRevealingKey(null);
  };

  const copyValue = async (key: string) => {
    let value = revealedValues[key];
    if (value === undefined) {
      const result = await onReveal(key);
      if (result === null) {
        toast.error("Value not found");
        return;
      }
      value = result;
    }
    const copied = await copyToClipboard(value);
    if (!copied) {
      toast.error("Failed to copy to clipboard");
      return;
    }
    setCopiedKey(key);
  };

  const handleKeyInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.includes("\n")) {
      e.preventDefault();
      setBulkText(text);
      setShowBulkPaste(true);
      clearDraft();
    }
  };

  const handleBulkImport = async () => {
    const parsed = parseEnvVars(bulkText);
    if (parsed.length === 0) return;
    await runBulkImport(async () => {
      await onBulkImport(parsed);
      setShowBulkPaste(false);
      setBulkText("");
    }, "Failed to import");
  };

  const parsedPreview = parseEnvVars(bulkText);
  const isAdding = draft?.mode === "add";

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowBulkPaste(true)}
          >
            <IconClipboard size={16} className="mr-1.5" />
            Paste
          </Button>
          <Button size="sm" onClick={startAdd} disabled={isAdding}>
            <IconPlus size={16} className="mr-1.5" />
            Add Variable
          </Button>
        </div>
      </div>

      {vars === undefined ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : !showTable ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted">
          <IconKey size={48} className="mb-3 opacity-40" />
          <p className="text-sm">No environment variables configured</p>
        </div>
      ) : (
        <Card className="shadow-none overflow-hidden">
          <CardContent className="p-0">
            <Table className="min-w-[360px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-2.5 py-2.5 font-medium sm:px-4">
                    Key
                  </TableHead>
                  <TableHead className="px-2.5 py-2.5 font-medium sm:px-4">
                    Value
                  </TableHead>
                  <TableHead className="px-2.5 py-2.5 text-right font-medium sm:px-4">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft?.mode === "add" ? (
                  <EnvVarRowEditor
                    draft={draft}
                    saving={saving}
                    autoFocus
                    onKeyChange={updateDraftKey}
                    onValueChange={updateDraftValue}
                    onSave={() => {
                      void saveDraft();
                    }}
                    onCancel={clearDraft}
                    onKeyPaste={handleKeyInputPaste}
                    valuePlaceholder="Enter value"
                    saveDisabled={!draft.key.trim() || !draft.value.trim()}
                  />
                ) : null}
                {sortedVars.map((entry) => {
                  const isEditing =
                    draft?.mode === "edit" && draft.originalKey === entry.key;
                  if (isEditing && draft !== null) {
                    return (
                      <EnvVarRowEditor
                        key={entry.key}
                        draft={draft}
                        saving={saving}
                        autoFocus
                        onKeyChange={updateDraftKey}
                        onValueChange={updateDraftValue}
                        onSave={() => {
                          void saveDraft();
                        }}
                        onCancel={clearDraft}
                        valuePlaceholder="New value (leave blank to keep)"
                        saveDisabled={!draft.key.trim()}
                      />
                    );
                  }
                  return (
                    <TableRow key={entry.key} className="hover:bg-transparent">
                      <TableCell className="px-2.5 py-2.5 font-mono text-xs sm:px-4">
                        {entry.key}
                      </TableCell>
                      <TableCell className="px-2.5 py-2.5 sm:px-4">
                        <span className="font-mono text-xs text-muted">
                          {revealedValues[entry.key] ?? entry.value}
                        </span>
                      </TableCell>
                      <TableCell className="px-2.5 py-2.5 text-right sm:px-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => toggleReveal(entry.key)}
                            disabled={revealingKey === entry.key}
                            title={
                              revealedValues[entry.key] !== undefined
                                ? "Hide value"
                                : "Reveal value"
                            }
                          >
                            {revealedValues[entry.key] !== undefined ? (
                              <IconEyeOff className="size-3.5" />
                            ) : (
                              <IconEye className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => copyValue(entry.key)}
                            title={
                              copiedKey === entry.key ? "Copied!" : "Copy value"
                            }
                          >
                            {copiedKey === entry.key ? (
                              <IconCheck className="size-3.5 text-accent" />
                            ) : (
                              <IconCopy className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => startEdit(entry)}
                            title="Edit"
                          >
                            <IconPencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setDeleteKey(entry.key)}
                            title="Delete"
                            className="text-danger hover:text-danger"
                          >
                            <IconTrash className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={showBulkPaste}
        onOpenChange={(open) => {
          if (!open) {
            setShowBulkPaste(false);
            setBulkText("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Paste Environment Variables</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Paste your variables in{" "}
              <span className="font-mono">KEY=VALUE</span> format, one per line.
              Lines starting with <span className="font-mono">#</span> are
              ignored.
            </p>
            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"OPENROUTER_API_KEY=sk-or-...\nANOTHER_KEY=value"}
              className="h-40 font-mono text-xs"
              autoFocus
            />
            {parsedPreview.length > 0 && (
              <p className="text-xs text-muted">
                {parsedPreview.length} variable
                {parsedPreview.length !== 1 ? "s" : ""} detected
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowBulkPaste(false);
                setBulkText("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleBulkImport}
              disabled={parsedPreview.length === 0 || bulkSaving}
            >
              {bulkSaving && <Spinner size="sm" className="mr-1.5" />}
              Import
              {parsedPreview.length > 0
                ? ` ${parsedPreview.length} Variable${parsedPreview.length !== 1 ? "s" : ""}`
                : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DestructiveConfirmDialog
        open={deleteKey !== null}
        onClose={() => setDeleteKey(null)}
        title="Delete Variable"
        description="This cannot be undone."
        confirmLabel="Delete"
        submittingLabel="Deleting..."
        submitting={false}
        onConfirm={() => {
          void confirmDelete();
        }}
      >
        Are you sure you want to delete{" "}
        <span className="font-mono font-medium">{deleteKey}</span>?
      </DestructiveConfirmDialog>
    </div>
  );
}
