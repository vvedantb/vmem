import { useState } from "react";
import { parseEnvVars } from "@vmem/shared";
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
} from "@vmem/ui";
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

export interface EnvVar {
  key: string;
  value: string;
}

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

export function EnvVarsTable({
  vars,
  onUpsert,
  onEdit,
  onReveal,
  onRemove,
  onBulkImport,
}: EnvVarsTableProps) {
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState("");
  const [addValue, setAddValue] = useState("");

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editKeyDraft, setEditKeyDraft] = useState("");
  const [editValueDraft, setEditValueDraft] = useState("");

  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {},
  );
  const [revealingKey, setRevealingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const sortedVars = (vars ?? [])
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key));
  const showTable = (vars && vars.length > 0) || adding;

  const startAdd = () => {
    setAdding(true);
    setAddKey("");
    setAddValue("");
  };

  const cancelAdd = () => {
    setAdding(false);
    setAddKey("");
    setAddValue("");
  };

  const handleAdd = async () => {
    if (!addKey.trim() || !addValue.trim()) return;
    setSaving(true);
    try {
      await onUpsert(addKey.trim(), addValue);
      setAdding(false);
      setAddKey("");
      setAddValue("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (entry: EnvVar) => {
    setEditingKey(entry.key);
    setEditKeyDraft(entry.key);
    setEditValueDraft("");
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditKeyDraft("");
    setEditValueDraft("");
  };

  const saveEdit = async () => {
    if (!editingKey || !editKeyDraft.trim()) return;
    const newKey = editKeyDraft.trim();
    const newValue = editValueDraft.trim() ? editValueDraft : undefined;
    if (newKey === editingKey && newValue === undefined) {
      cancelEdit();
      return;
    }
    setSaving(true);
    try {
      await onEdit(editingKey, newKey, newValue);
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[editingKey];
        if (newKey !== editingKey) delete next[newKey];
        return next;
      });
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
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
    } finally {
      setRevealingKey(null);
    }
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
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleKeyInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.includes("\n")) {
      e.preventDefault();
      setBulkText(text);
      setShowBulkPaste(true);
      cancelAdd();
    }
  };

  const handleBulkImport = async () => {
    const parsed = parseEnvVars(bulkText);
    if (parsed.length === 0) return;
    setBulkSaving(true);
    try {
      await onBulkImport(parsed);
      setShowBulkPaste(false);
      setBulkText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setBulkSaving(false);
    }
  };

  const parsedPreview = parseEnvVars(bulkText);

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
          <Button size="sm" onClick={startAdd} disabled={adding}>
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
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm min-w-[360px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-2.5 py-2.5 font-medium sm:px-4">Key</th>
                  <th className="px-2.5 py-2.5 font-medium sm:px-4">Value</th>
                  <th className="px-2.5 py-2.5 text-right font-medium sm:px-4">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {adding && (
                  <tr>
                    <td className="px-2.5 py-2.5 sm:px-4">
                      <Input
                        value={addKey}
                        onChange={(e) => setAddKey(e.target.value)}
                        onPaste={handleKeyInputPaste}
                        placeholder="e.g. OPENROUTER_API_KEY"
                        className="h-8 font-mono text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelAdd();
                        }}
                      />
                    </td>
                    <td className="px-2.5 py-2.5 sm:px-4">
                      <Input
                        value={addValue}
                        onChange={(e) => setAddValue(e.target.value)}
                        placeholder="Enter value"
                        className="h-8 font-mono text-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleAdd();
                          if (e.key === "Escape") cancelAdd();
                        }}
                      />
                    </td>
                    <td className="px-2.5 py-2.5 text-right sm:px-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={handleAdd}
                          disabled={
                            !addKey.trim() || !addValue.trim() || saving
                          }
                          title="Save"
                          className="text-accent hover:text-accent"
                        >
                          <IconCheck size={14} />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={cancelAdd}
                          title="Cancel"
                        >
                          <IconX size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                {sortedVars.map((entry) => {
                  const isEditing = editingKey === entry.key;
                  return (
                    <tr key={entry.key}>
                      <td className="px-2.5 py-2.5 font-mono text-xs sm:px-4">
                        {isEditing ? (
                          <Input
                            value={editKeyDraft}
                            onChange={(e) => setEditKeyDraft(e.target.value)}
                            placeholder="Key"
                            className="h-8 font-mono text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                        ) : (
                          entry.key
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 sm:px-4">
                        {isEditing ? (
                          <Input
                            value={editValueDraft}
                            onChange={(e) => setEditValueDraft(e.target.value)}
                            placeholder="New value (leave blank to keep)"
                            className="h-8 font-mono text-xs"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                        ) : (
                          <span className="font-mono text-xs text-muted">
                            {revealedValues[entry.key] ?? entry.value}
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 text-right sm:px-4">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={saveEdit}
                              disabled={!editKeyDraft.trim() || saving}
                              title="Save"
                              className="text-accent hover:text-accent"
                            >
                              <IconCheck size={14} />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={cancelEdit}
                              title="Cancel"
                            >
                              <IconX size={14} />
                            </Button>
                          </div>
                        ) : (
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
                                <IconEyeOff size={14} />
                              ) : (
                                <IconEye size={14} />
                              )}
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => copyValue(entry.key)}
                              title={
                                copiedKey === entry.key
                                  ? "Copied!"
                                  : "Copy value"
                              }
                            >
                              {copiedKey === entry.key ? (
                                <IconCheck size={14} className="text-accent" />
                              ) : (
                                <IconCopy size={14} />
                              )}
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => startEdit(entry)}
                              title="Edit"
                            >
                              <IconPencil size={14} />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setDeleteKey(entry.key)}
                              title="Delete"
                              className="text-danger hover:text-danger"
                            >
                              <IconTrash size={14} />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

      <Dialog
        open={deleteKey !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Variable</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted">
            Are you sure you want to delete{" "}
            <span className="font-mono font-medium text-foreground">
              {deleteKey}
            </span>
            ? This cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteKey(null)}
            >
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
