export type ExportImportRow = {
  stableId: string;
  title: string;
  content: string;
};

export type ParseExportResult =
  | { ok: true; rows: ExportImportRow[] }
  | { ok: false; error: string };
