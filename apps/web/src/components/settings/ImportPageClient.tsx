"use client";

import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@vmem/backend";
import { Button } from "@vmem/ui";
import { toast } from "sonner";
import PageContainer from "@/components/PageContainer";
import ClaudeLogo from "./ClaudeLogo";
import OpenAiLogo from "./OpenAiLogo";
import UploadImportModal, { type ImportProvider } from "./UploadImportModal";
import SelectImportRowsModal from "./SelectImportRowsModal";
import { parseChatGptExportBuffer } from "../_utils/parseChatGptExport";
import { parseClaudeExportBuffer } from "../_utils/parseClaudeExport";
import type { ExportImportRow } from "../_utils/importRows";

export default function ImportPageClient() {
  const createMemory = useAction(api.memoryApi.createMemory);
  const [provider, setProvider] = useState<ImportProvider | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const [rows, setRows] = useState<ExportImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const openUpload = (p: ImportProvider) => {
    setProvider(p);
    setUploadOpen(true);
  };

  const closeUpload = () => {
    setUploadOpen(false);
    setProvider(null);
  };

  const handleFile = useCallback(
    async (file: File) => {
      if (!provider) return;
      setParsing(true);
      try {
        const buf = await file.arrayBuffer();
        const result =
          provider === "chatgpt"
            ? parseChatGptExportBuffer(buf)
            : parseClaudeExportBuffer(buf);
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
    [provider],
  );

  const closeSelect = () => {
    setSelectOpen(false);
    setRows([]);
    setProvider(null);
  };

  const handleImport = async (selected: ExportImportRow[]) => {
    if (!provider) return;
    setImporting(true);
    const source = provider === "chatgpt" ? "import:chatgpt" : "import:claude";
    const tag = provider === "chatgpt" ? "chatgpt" : "claude";
    let ok = 0;
    for (const row of selected) {
      try {
        await createMemory({
          title: row.title,
          content: row.content,
          type: "episodic",
          source,
          tags: ["import", tag],
          confidence: 0.75,
          queueForLocalEnrichment: true,
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

  return (
    <>
      <PageContainer title="Import" centeredMaxWidth showTitle>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl bg-muted/40 p-6">
            <div className="mb-4 flex items-center gap-3">
              <OpenAiLogo className="h-6 w-6 shrink-0 text-[#10A37F] dark:text-[#1EC286]" />
              <h3 className="text-base font-medium text-foreground">ChatGPT</h3>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              Upload the file you get from ChatGPT&apos;s export. Choose which
              chats to keep here so they are easy to find later.
            </p>
            <Button type="button" onClick={() => openUpload("chatgpt")}>
              Import
            </Button>
          </div>

          <div className="rounded-xl bg-muted/40 p-6">
            <div className="mb-4 flex items-center gap-3">
              <ClaudeLogo className="h-6 w-6 shrink-0 text-[#D97757] dark:text-[#EA9A7A]" />
              <h3 className="text-base font-medium text-foreground">Claude</h3>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              Upload your Claude export from Settings → Privacy. Choose which
              conversations to keep; they are saved with your other material
              here for later.
            </p>
            <Button type="button" onClick={() => openUpload("claude")}>
              Import
            </Button>
          </div>
        </div>
      </PageContainer>

      {uploadOpen && provider !== null ? (
        <UploadImportModal
          open={uploadOpen}
          provider={provider}
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
