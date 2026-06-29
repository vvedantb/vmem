import { Fragment, useContext } from "react";
import type { ComponentType } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { IconArrowRight } from "@tabler/icons-react";
import { motionDuration, motionEase } from "@vmem/ui";
import { SlideStepContext } from "./SlideShell";

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
}

interface PipelineHowStagesProps {
  stages: PipelineStage[];
}

const cardSpring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 28,
};

const cardVariants: Variants = {
  hidden: { opacity: 0, x: -28, scale: 0.94 },
  show: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: cardSpring,
  },
};

const lineVariants: Variants = {
  hidden: { opacity: 0, scaleX: 0 },
  show: {
    opacity: 1,
    scaleX: 1,
    transition: { duration: motionDuration.base, ease: motionEase },
  },
};

const contentVariants: Variants = {
  hidden: { opacity: 0, y: 8, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: motionDuration.base, ease: motionEase },
  },
};

const contentStagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

/**
 * Four-stage pipeline for ?slide=6. Build steps 1–4 reveal each card from the
 * left; a progress rail and travelling dot show where you are in the flow.
 * Motion follows framer-motion-animator + elite-powerpoint-designer: springs,
 * GPU transforms, one focal stage, reduced-motion safe.
 */
export function PipelineHowStages({ stages }: PipelineHowStagesProps) {
  const step = useContext(SlideStepContext);
  const reduceMotion = useReducedMotion();

  return (
    <div className="mt-8">
      <PipelineProgressRail stageCount={stages.length} step={step} />

      <div className="flex items-stretch gap-3">
        {stages.map((stage, i) => {
          if (step < i + 1) return null;

          return (
            <Fragment key={stage.title}>
              {i > 0 ? (
                <PipelineConnector
                  travelling={step === i + 1}
                  complete={step > i + 1}
                  reduceMotion={reduceMotion === true}
                />
              ) : null}
              <PipelineStageCard
                stage={stage}
                active={step === i + 1}
                reduceMotion={reduceMotion === true}
              />
            </Fragment>
          );
        })}
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
      {Array.from({ length: stageCount }, (_, i) => {
        const complete = step > i + 1;
        const active = step === i + 1;

        return (
          <div
            key={i}
            className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-foreground/8"
          >
            <motion.div
              className="absolute inset-0 origin-left rounded-full bg-foreground/45"
              initial={{ scaleX: 0 }}
              animate={{
                scaleX: complete ? 1 : active ? 0.55 : 0,
              }}
              transition={
                active
                  ? { duration: 1.1, ease: motionEase }
                  : { duration: motionDuration.fast, ease: motionEase }
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function PipelineStageCard({
  stage,
  active,
  reduceMotion,
}: {
  stage: PipelineStage;
  active: boolean;
  reduceMotion: boolean;
}) {
  const Icon = stage.icon;

  return (
    <motion.div
      className={`relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl px-4 py-4 ${
        active ? "bg-surface-tertiary" : "bg-surface-secondary/60"
      }`}
      variants={cardVariants}
      initial="hidden"
      animate="show"
      transition={reduceMotion ? { duration: 0 } : cardSpring}
    >
      {active ? (
        <motion.div
          layoutId="pipeline-stage-focus"
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-foreground/14"
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 380, damping: 32 }
          }
        />
      ) : null}

      <motion.div
        className="relative"
        variants={contentStagger}
        initial="hidden"
        animate="show"
      >
        <div className="mb-3 flex items-center justify-between">
          <motion.span
            className="font-instrumentSerif text-2xl tabular-nums text-foreground/70"
            variants={contentVariants}
          >
            {stage.index}
          </motion.span>
          <motion.div
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background"
            variants={contentVariants}
            animate={
              active && !reduceMotion ? { scale: [1, 1.07, 1] } : { scale: 1 }
            }
            transition={
              active
                ? { duration: 0.55, ease: motionEase }
                : { duration: motionDuration.fast, ease: motionEase }
            }
          >
            <Icon size={15} stroke={1.5} />
          </motion.div>
        </div>
        <motion.p
          className="text-sm font-medium text-foreground"
          variants={contentVariants}
        >
          {stage.title}
        </motion.p>
        <motion.p
          className="mt-1.5 text-sm leading-relaxed text-foreground"
          variants={contentVariants}
        >
          {stage.body}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

function PipelineConnector({
  travelling,
  complete,
  reduceMotion,
}: {
  travelling: boolean;
  complete: boolean;
  reduceMotion: boolean;
}) {
  const filled = complete || travelling;
  const travelDuration = reduceMotion
    ? 0
    : travelling
      ? 0.7
      : motionDuration.fast;

  return (
    <motion.div
      className="relative flex w-10 shrink-0 items-center self-center"
      variants={lineVariants}
      initial="hidden"
      animate="show"
    >
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/10" />
      <motion.div
        className="absolute inset-x-0 top-1/2 h-px origin-left -translate-y-1/2 bg-foreground/40"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: filled ? 1 : 0 }}
        transition={{ duration: travelDuration, ease: motionEase }}
      />
      <motion.div
        className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
        initial={{ x: 0, opacity: 0 }}
        animate={{
          x: filled ? "2.5rem" : 0,
          opacity: filled ? 1 : 0,
        }}
        transition={{ duration: travelDuration, ease: motionEase }}
      />
      <IconArrowRight size={14} className="text-muted/25" stroke={1.5} />
    </motion.div>
  );
}
