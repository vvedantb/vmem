"use client";

import { Toaster } from "sonner";

function SonnerToaster(props: React.ComponentProps<typeof Toaster>) {
  return (
    <Toaster
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast glass-panel-strong group-[.toaster]:rounded-xl group-[.toaster]:text-foreground",
          description: "group-[.toast]:text-muted-foreground/95",
          actionButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground",
        },
      }}
      {...props}
    />
  );
}

export { SonnerToaster };
