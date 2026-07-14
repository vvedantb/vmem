"use client";

import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@vmem/backend";
import { Button, Card, CardContent } from "@vmem/ui";
import { toast } from "sonner";
import UploadImportModal from "./UploadImportModal";
import SelectImportRowsModal from "./SelectImportRowsModal";
import { importProviders, type AvailableProvider } from "./importProviders";
import type { ExportImportRow } from "@/lib/chat-export/importRows";

function findAvailable(id: string | null): AvailableProvider | null {
  if (id === null) return null;
  for (const p of importProviders) {
    if (p.id === id) return p;
  }
  return null;
}

// panel body for the Import tab on `/settings/data-controls/import`
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
    const results = await Promise.allSettled(
      selected.map((row) =>
        createMemory({
          title: row.title,
          content: row.content,
          type: "episodic",
          source: p.source,
          tags: ["import", p.tag],
          confidence: 0.75,
        }),
      ),
    );
    let ok = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results.at(i);
      const row = selected.at(i);
      if (result?.status === "fulfilled") {
        ok += 1;
      } else if (row) {
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
          return (
            <section key={p.id} className="space-y-3">
              <div className="flex items-center gap-3">
                <Logo className={`h-6 w-6 shrink-0 ${p.logoClassName}`} />
                <h3 className="text-base font-medium text-foreground text-balance">
                  {p.label}
                </h3>
              </div>
              <Card className="shadow-none">
                <CardContent className="p-6">
                  <p className="mb-5 text-sm text-muted">{p.description}</p>
                  <Button type="button" onClick={() => openUpload(p.id)}>
                    Import
                  </Button>
                </CardContent>
              </Card>
            </section>
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
