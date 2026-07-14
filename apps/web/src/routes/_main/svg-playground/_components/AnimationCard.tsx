import { useState, type ReactNode } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { Button } from "@vmem/ui";

interface AnimationCardProps {
  // numeric label rendered as `{n}.` before the title
  number: number;
  title: string;
  // single-line hint about the animation's intent
  description: string;
  // `true` for animations that need a replay button (one-shot)
  oneShot?: boolean;
  // `true` to render a "hover me" hint under the demo
  hoverHint?: boolean;
  // `render` receives a `replayKey` that changes each time the user clicks the replay button
  render: (replayKey: number) => ReactNode;
}

export function AnimationCard({
  number,
  title,
  description,
  oneShot,
  hoverHint,
  render,
}: AnimationCardProps) {
  const [replayKey, setReplayKey] = useState(0);

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg bg-surface-secondary/40 p-6">
      <div className="flex h-32 w-32 items-center justify-center text-foreground">
        {render(replayKey)}
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-sm font-medium text-foreground">
          {number}. {title}
        </h3>
        <p className="text-xs text-muted leading-snug max-w-[14rem]">
          {description}
        </p>
        {hoverHint && (
          <p className="text-[11px] text-muted/70 italic mt-1">
            Hover the icon
          </p>
        )}
      </div>

      {oneShot && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setReplayKey((k) => k + 1)}
          className="text-muted hover:text-foreground"
        >
          <IconRefresh className="size-3.5" stroke={1.5} />
          Replay
        </Button>
      )}
    </div>
  );
}
