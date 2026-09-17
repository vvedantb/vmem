import { Fragment, useContext } from "react";
import type { ComponentType } from "react";
import { motion } from "motion/react";
import { IconArrowRight } from "@tabler/icons-react";
import { motionDuration, motionEase } from "@vmem/ui";
import { SlideStepContext } from "./SlideShell";
import { StageVisual, type StageVisualKind } from "./PipelineStageVisuals";

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

export interface PipelineStage {
  index: string;
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
  /** Which looping mini-scene plays under the card. */
  visual: StageVisualKind;
}

interface PipelineHowStagesProps {
  stages: PipelineStage[];
}

/**
 * Four-stage pipeline for ?slide=04. All four cards hold their slot from the
 * start, so there's no width reflow as steps reveal — each card just fades in
 * place when its build step arrives, and its mini-scene loops continuously.
 */
export function PipelineHowStages({ stages }: PipelineHowStagesProps) {
  const step = useContext(SlideStepContext);

  return (
    <div className="mt-8">
      <PipelineProgressRail stageCount={stages.length} step={step} />

      <div className="flex items-stretch gap-3">
        {stages.map((stage, i) => (
          <Fragment key={stage.title}>
            {i > 0 ? <PipelineConnector revealed={step >= i + 1} /> : null}
            <PipelineStageCard stage={stage} revealed={step >= i + 1} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function PipelineProgressRail({
  stageCount,
  step,
}: {
  stageCount: number;
  step: number;
}) {
  return (
    <div className="mb-5 flex gap-1.5">
      {Array.from({ length: stageCount }, (_, i) => (
        <div
          key={i}
          className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-foreground/8"
        >
          <motion.div
            className="absolute inset-0 origin-left rounded-full bg-foreground/45"
            initial={false}
            animate={{ scaleX: step >= i + 1 ? 1 : 0 }}
            transition={{ duration: motionDuration.base, ease: motionEase }}
          />
        </div>
      ))}
    </div>
  );
}

function PipelineStageCard({
  stage,
  revealed,
}: {
  stage: PipelineStage;
  revealed: boolean;
}) {
  const Icon = stage.icon;

  return (
    <motion.div
      className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface-secondary/60 px-4 py-4"
      initial={false}
      animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 10 }}
      transition={{ duration: motionDuration.base, ease: motionEase }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-instrumentSerif text-2xl tabular-nums text-foreground/70">
          {stage.index}
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
          <Icon size={15} stroke={1.5} />
        </div>
      </div>
      <p className="text-sm font-medium text-foreground">{stage.title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground">
        {stage.body}
      </p>
      <div className="mt-4">
        <StageVisual kind={stage.visual} />
      </div>
    </motion.div>
  );
}

function PipelineConnector({ revealed }: { revealed: boolean }) {
  return (
    <motion.div
      className="flex w-10 shrink-0 items-center justify-center self-center"
      initial={false}
      animate={{ opacity: revealed ? 1 : 0 }}
      transition={{ duration: motionDuration.base, ease: motionEase }}
      aria-hidden
    >
      <IconArrowRight size={16} className="text-muted/40" stroke={1.5} />
    </motion.div>
  );
}
