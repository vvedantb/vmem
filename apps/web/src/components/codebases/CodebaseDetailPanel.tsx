"use client";

/**
 * Detail panel that slides in from the right when a file node is clicked.
 * Shows file info (name, path, directory, extension) and related files
 * (imports + imported by) as clickable items.
 */

import {
  IconX,
  IconFile,
  IconFolder,
  IconArrowRight,
  IconArrowLeft,
} from "@tabler/icons-react";
import { Badge } from "@vmem/ui";
import { AnimatePresence, motion } from "motion/react";
import type { RelatedFile } from "./codebase-graph-data";

interface FileNodeData {
  id: string;
  filename: string;
  path: string;
  directory: string;
}

interface CodebaseDetailPanelProps {
  nodeData: FileNodeData | null;
  relatedFiles: RelatedFile[];
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}

/** Extract the file extension from a filename, e.g. "index.tsx" -> ".tsx" */
function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === 0) return "";
  return filename.slice(dotIndex);
}

export function CodebaseDetailPanel({
  nodeData,
  relatedFiles,
  onClose,
  onNavigate,
}: CodebaseDetailPanelProps) {
  const imports = relatedFiles.filter((f) => f.direction === "imports");
  const importedBy = relatedFiles.filter((f) => f.direction === "imported_by");

  return (
    <AnimatePresence>
      {nodeData && (
        <motion.div
          key="detail-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="absolute top-0 right-0 bottom-0 w-80 z-20 bg-background/95 backdrop-blur-sm border-l border-border overflow-y-auto hidden md:flex flex-col"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-4 pb-2">
            <div className="min-w-0 flex-1 flex items-start gap-2">
              <IconFile
                size={18}
                className="text-muted-foreground mt-0.5 flex-shrink-0"
              />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground truncate">
                  {nodeData.filename}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                  {nodeData.path}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors flex-shrink-0"
            >
              <IconX size={16} />
            </button>
          </div>

          {/* File metadata */}
          <div className="px-4 py-2">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Directory</span>
                <p className="text-foreground font-mono mt-0.5 truncate flex items-center gap-1">
                  <IconFolder size={12} className="flex-shrink-0" />
                  {nodeData.directory || "(root)"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Extension</span>
                <p className="text-foreground font-mono mt-0.5">
                  {getExtension(nodeData.filename) || "none"}
                </p>
              </div>
            </div>
          </div>

          {/* Imports section */}
          {imports.length > 0 && (
            <div className="px-4 py-2 border-t border-border mt-2">
              <div className="flex items-center gap-1.5 mb-2">
                <IconArrowRight size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Imports
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1 bg-muted border-border"
                >
                  {imports.length}
                </Badge>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                {imports.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => onNavigate(file.id)}
                    className="w-full p-2 rounded-md bg-muted/50 border border-border hover:bg-accent transition-colors text-left"
                  >
                    <p className="text-xs font-medium text-foreground truncate font-mono">
                      {file.filename}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5 font-mono">
                      {file.path}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Imported by section */}
          {importedBy.length > 0 && (
            <div className="px-4 py-2 border-t border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <IconArrowLeft size={12} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Imported by
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1 bg-muted border-border"
                >
                  {importedBy.length}
                </Badge>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                {importedBy.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => onNavigate(file.id)}
                    className="w-full p-2 rounded-md bg-muted/50 border border-border hover:bg-accent transition-colors text-left"
                  >
                    <p className="text-xs font-medium text-foreground truncate font-mono">
                      {file.filename}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5 font-mono">
                      {file.path}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No relations */}
          {relatedFiles.length === 0 && (
            <div className="px-4 py-6 text-center border-t border-border mt-2">
              <p className="text-xs text-muted-foreground">
                No import relationships found for this file.
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
