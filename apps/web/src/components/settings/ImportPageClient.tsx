"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@vmem/backend";
import { Button, Card, CardContent } from "@vmem/ui";
import { toast } from "sonner";
import UploadImportModal from "./UploadImportModal";
import SelectImportRowsModal from "./SelectImportRowsModal";
import { importProviders, type ImportProvider } from "./importProviders";
import type { ExportImportRow } from "@/lib/chat-export/importRows";

type ImportStep =
  | { phase: "idle" }
  | { phase: "upload"; providerId: string }
  | { phase: "select"; providerId: string; rows: ExportImportRow[] };

function findProvider(id: string | null): ImportProvider | null {
  if (id === null) return null;
  return importProviders.find((p) => p.id === id) ?? null;
}

function ImportProviderCard({
  provider,
  onImport,
}: {
  provider: ImportProvider;
  onImport: (id: string) => void;
}) {
  const Logo = provider.Logo;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <Logo className={`h-6 w-6 shrink-0 ${provider.logoClassName}`} />
        <h3 className="text-base font-medium text-foreground text-balance">
          {provider.label}
        </h3>
      </div>
      <Card className="shadow-none">
        <CardContent className="p-6">
          <p className="mb-5 text-sm text-muted">{provider.description}</p>
          <Button type="button" onClick={() => onImport(provider.id)}>
            Import
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

// panel body for the Import tab on `/settings/data-controls/import`
export default function ImportPageClient() {
  const createMemory = useAction(api.memoryApi.createMemory);
  const [step, setStep] = useState<ImportStep>({ phase: "idle" });
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const openUpload = (id: string) => {
    setStep({ phase: "upload", providerId: id });
  };

  const closeUpload = () => {
    setStep({ phase: "idle" });
  };

  const handleFile = async (file: File) => {
    if (step.phase !== "upload") return;
    const p = findProvider(step.providerId);
    if (!p) return;
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const result = p.parser(buf);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setStep({
        phase: "select",
        providerId: step.providerId,
        rows: result.rows,
      });
    } finally {
      setParsing(false);
    }
  };

  const closeSelect = () => {
    setStep({ phase: "idle" });
  };

  const handleImport = async (selected: ExportImportRow[]) => {
    if (step.phase !== "select") return;
    const p = findProvider(step.providerId);
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

  const uploadProvider =
    step.phase === "upload" ? findProvider(step.providerId) : null;
  const selectRows = step.phase === "select" ? step.rows : [];

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {importProviders.map((p) => (
          <ImportProviderCard key={p.id} provider={p} onImport={openUpload} />
        ))}
      </div>

      {step.phase === "upload" && uploadProvider !== null ? (
        <UploadImportModal
          open
          provider={uploadProvider}
          onClose={closeUpload}
          onFile={handleFile}
          isParsing={parsing}
        />
      ) : null}

      <SelectImportRowsModal
        key={
          step.phase === "select"
            ? step.rows.map((r) => r.stableId).join("\0")
            : "idle"
        }
        open={step.phase === "select"}
        rows={selectRows}
        onClose={closeSelect}
        onConfirm={handleImport}
        isImporting={importing}
      />
    </>
  );
}
