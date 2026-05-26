"use client";

import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@vmem/backend";
import { Button } from "@vmem/ui";
import { toast } from "sonner";
import UploadImportModal from "./UploadImportModal";
import SelectImportRowsModal from "./SelectImportRowsModal";
import { importProviders, type AvailableProvider } from "./importProviders";
import type { ExportImportRow } from "../_utils/importRows";

function findAvailable(id: string | null): AvailableProvider | null {
  if (id === null) return null;
  for (const p of importProviders) {
    if (p.kind === "available" && p.id === id) return p;
  }
  return null;
}

/**
 * Panel body for the Import tab on `/settings/data-controls/import`.
 * Lists every connector and walks the user through upload → row-pick →
 * batch-create. The route file owns the page header (title, tabs); this
 * component renders only the tab body.
 */
export default function ImportPageClient() {
  const createMemory = useAction(api.memoryApi.createMemory);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const [rows, setRows] = useState<ExportImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const openUpload = (id: string) => {
    setProviderId(id);
    setUploadOpen(true);
  };

  const closeUpload = () => {
    setUploadOpen(false);
    setProviderId(null);
  };

  const handleFile = useCallback(
    async (file: File) => {
      const p = findAvailable(providerId);
      if (!p) return;
      setParsing(true);
      try {
        const buf = await file.arrayBuffer();
        const result = p.parser(buf);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setRows(result.rows);
        setUploadOpen(false);
        setSelectOpen(true);
      } finally {
        setParsing(false);
      }
    },
    [providerId],
  );

  const closeSelect = () => {
    setSelectOpen(false);
    setRows([]);
    setProviderId(null);
  };

  const handleImport = async (selected: ExportImportRow[]) => {
    const p = findAvailable(providerId);
    if (!p) return;
    setImporting(true);
    let ok = 0;
    for (const row of selected) {
      try {
        await createMemory({
          title: row.title,
          content: row.content,
          type: "episodic",
          source: p.source,
          tags: ["import", p.tag],
          confidence: 0.75,
        });
        ok += 1;
      } catch {
        toast.error(`Failed to import: ${row.title}`);
      }
    }
    setImporting(false);
    closeSelect();
    toast.success(
      ok === 1
        ? "Saved 1 conversation to your library."
        : `Saved ${String(ok)} conversations to your library.`,
    );
  };

  const activeProvider = findAvailable(providerId);

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {importProviders.map((p) => {
          const Logo = p.Logo;
          if (p.kind === "available") {
            return (
              <div
                key={p.id}
                className="rounded-lg bg-surface-secondary/40 p-6"
              >
                <div className="mb-4 flex items-center gap-3">
                  <Logo className={`h-6 w-6 shrink-0 ${p.logoClassName}`} />
                  <h3 className="text-base font-medium text-foreground">
                    {p.label}
                  </h3>
                </div>
                <p className="mb-5 text-sm text-muted">{p.description}</p>
                <Button type="button" onClick={() => openUpload(p.id)}>
                  Import
                </Button>
              </div>
            );
          }
          return (
            <div
              key={p.id}
              className="rounded-lg bg-surface-secondary/40 p-6 opacity-60"
            >
              <div className="mb-4 flex items-center gap-3">
                <Logo className={`h-6 w-6 shrink-0 ${p.logoClassName}`} />
                <h3 className="text-base font-medium text-foreground">
                  {p.label}
                </h3>
              </div>
              <p className="mb-5 text-sm text-muted">{p.description}</p>
              <Button type="button" disabled>
                Coming soon
              </Button>
            </div>
          );
        })}
      </div>

      {uploadOpen && activeProvider !== null ? (
        <UploadImportModal
          open={uploadOpen}
          provider={activeProvider}
          onClose={closeUpload}
          onFile={handleFile}
          isParsing={parsing}
        />
      ) : null}

      <SelectImportRowsModal
        open={selectOpen}
        rows={rows}
        onClose={closeSelect}
        onConfirm={handleImport}
        isImporting={importing}
      />
    </>
  );
}
