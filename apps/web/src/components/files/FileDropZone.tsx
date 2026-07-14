"use client";

import { useState, useCallback, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import { IconUpload } from "@tabler/icons-react";

interface FileDropZoneProps {
  onFilesDropped: (files: File[]) => void;
  children: ReactNode;
}

export default function FileDropZone({
  onFilesDropped,
  children,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        onFilesDropped(droppedFiles);
      }
    },
    [onFilesDropped],
  );

  return (
    <div
      className="relative flex-1 min-h-0"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      <AnimatePresence initial={false}>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionDuration.fast, ease: motionEase }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-accent bg-accent/5"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
              <IconUpload size={28} className="text-accent" />
            </div>
            <p className="text-base font-medium text-foreground">
              Drop files to upload
            </p>
            <p className="text-sm text-muted">
              Files will be added to the current folder
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
