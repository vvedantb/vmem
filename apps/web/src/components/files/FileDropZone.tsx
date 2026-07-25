import type { ReactNode } from "react";
import { useDropzone } from "react-dropzone";
import { AnimatePresence, motion } from "motion/react";
import { Input, motionDuration, motionEase } from "@vmem/ui";
import { IconUpload } from "@tabler/icons-react";

interface FileDropZoneProps {
  onFilesDropped: (files: File[]) => void;
  children: ReactNode;
}

export default function FileDropZone({
  onFilesDropped,
  children,
}: FileDropZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) onFilesDropped(acceptedFiles);
    },
  });

  return (
    <div
      {...getRootProps({
        className: "relative flex-1 min-h-0",
      })}
    >
      <Input {...getInputProps()} />
      {children}

      <AnimatePresence initial={false}>
        {isDragActive && (
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
