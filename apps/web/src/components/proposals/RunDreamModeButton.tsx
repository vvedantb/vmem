import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Spinner } from "@vvedantb/ui";
import { IconSparkles } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { useAsyncSubmit } from "@/hooks/useAsyncSubmit";

// Dreaming page "Run dream mode" button: runs the nightly dream pass now
export default function RunDreamModeButton() {
  const runDreamNow = useAction(api.dreaming.runNow);
  const queryClient = useQueryClient();
  const { submitting: isRunning, run: runDream } = useAsyncSubmit();

  async function handleClick() {
    if (isRunning) return;
    await runDream(async () => {
      const result = await runDreamNow({});
      switch (result.reason) {
        case "ok": {
          const { counts } = result;
          const merged = counts.exactMerged + counts.keyMerged;
          const parts: string[] = [];
          if (merged > 0) {
            parts.push(
              `${merged} duplicate group${merged === 1 ? "" : "s"} merged`,
            );
          }
          if (counts.expired > 0) parts.push(`${counts.expired} expired`);
          if (counts.archived > 0) parts.push(`${counts.archived} archived`);
          toast.success(
            parts.length > 0
              ? `Dream Mode: ${parts.join(", ")}`
              : "Dream Mode found nothing to clean up",
          );
          void queryClient.invalidateQueries({ queryKey: ["memories"] });
          break;
        }
        case "disabled":
          toast.message("Dream Mode is paused right now — try later");
          break;
        case "no-user":
          toast.error("Sign in to run Dream Mode");
          break;
        case "rate-limited":
          toast.message("Dream Mode already ran in the last hour — try later");
          break;
      }
    }, "Dream Mode failed to run");
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        void handleClick();
      }}
      disabled={isRunning}
      className="gap-1.5"
    >
      {isRunning ? <DreamModeButtonRunning /> : <DreamModeButtonIdle />}
    </Button>
  );
}

function DreamModeButtonIdle() {
  return (
    <>
      <IconSparkles size={14} />
      Run dream mode
    </>
  );
}

function DreamModeButtonRunning() {
  return (
    <>
      <Spinner size={14} tone="inherit" decorative />
      Dreaming…
    </>
  );
}
