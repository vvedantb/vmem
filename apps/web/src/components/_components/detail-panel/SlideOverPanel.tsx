import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconX } from "@tabler/icons-react";
import { Button } from "@vmem/ui";

interface SlideOverPanelProps {
  open: boolean;
  width: "w-80" | "w-96";
  onClose: () => void;
  header: ReactNode;
  children: ReactNode;
}

// shared right-side slide-over shell for graph/codebase detail panels
export function SlideOverPanel({
  open,
  width,
  onClose,
  header,
  children,
}: SlideOverPanelProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="slide-over-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className={`absolute top-0 right-0 bottom-0 ${width} z-20 glass-panel-strong overflow-y-auto hidden md:flex flex-col`}
        >
          <div className="flex items-start justify-between p-4 pb-2">
            {header}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="ml-2 shrink-0 text-muted hover:text-foreground"
              aria-label="Close panel"
            >
              <IconX size={16} />
            </Button>
          </div>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
