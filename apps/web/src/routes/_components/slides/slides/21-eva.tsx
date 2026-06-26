import { useContext } from "react";
import {
  IconBolt,
  IconChecklist,
  IconFileText,
  IconMessageQuestion,
  IconPencil,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import { EvaIcon } from "@/components/brand-icons";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideBody,
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
  SlideStepContext,
} from "../_components/SlideShell";

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

interface Remembers {
  icon: ComponentType<IconProps>;
  label: string;
}

const REMEMBERS: Remembers[] = [
  { icon: IconBolt, label: "Every action performed" },
  { icon: IconChecklist, label: "Every task created" },
  { icon: IconPencil, label: "Every change requested" },
  { icon: IconFileText, label: "Every document written" },
  { icon: IconMessageQuestion, label: "Every question asked" },
];

const LOCKUP_ICON_SIZE = 72;
const LOCKUP_SETTLED_SCALE = 0.55;
/** icon.png has heavy padding — zoom so the white mark matches Eva's visual weight. */
const VMEM_ICON_ZOOM = 1.5;
const layoutEase = [0.4, 0, 0.2, 1] as const;

const lockupItem = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: motionDuration.base, ease: motionEase },
  },
};

/** Black app icon — PNG padding cropped by overflow + zoom. */
function VmemLockupIcon({ size }: { size: number }) {
  const zoomed = size * VMEM_ICON_ZOOM;
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-black"
      style={{ width: size, height: size }}
    >
      <img
        src="/icon.png"
        alt=""
        width={zoomed}
        height={zoomed}
        className="max-w-none"
        draggable={false}
      />
    </span>
  );
}

/** Eva | vmem partnership lockup — hero-sized, then shrinks into a header. */
function PartnershipLockup({ settled }: { settled: boolean }) {
  return (
    <motion.div
      layout
      transition={{ layout: { duration: 0.7, ease: layoutEase } }}
      className={settled ? "mb-8 flex justify-center" : ""}
    >
      <motion.div
        className="flex origin-center items-center gap-8"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: { staggerChildren: 0.22, delayChildren: 0.2 },
          },
        }}
      >
        <motion.div
          animate={{ scale: settled ? LOCKUP_SETTLED_SCALE : 1 }}
          transition={{ duration: 0.7, ease: layoutEase }}
          className="flex origin-center items-center gap-8"
        >
          <motion.div variants={lockupItem} className="flex items-center gap-4">
            <EvaIcon size={LOCKUP_ICON_SIZE} className="rounded-full" />
            <span className="font-instrumentSerif text-7xl text-foreground">
              Eva
            </span>
          </motion.div>

          <motion.span
            variants={lockupItem}
            className="font-instrumentSerif text-5xl text-muted"
            aria-hidden
          >
            |
          </motion.span>

          <motion.div variants={lockupItem} className="flex items-center gap-4">
            <VmemLockupIcon size={LOCKUP_ICON_SIZE} />
            <span className="font-instrumentSerif text-7xl text-foreground">
              v<span className="italic">mem</span>
            </span>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function Slide21Eva() {
  const step = useContext(SlideStepContext);
  const settled = step >= 1;

  return (
    <SlideShell>
      <div
        className={`flex w-full flex-col ${settled ? "" : "flex-1 items-center justify-center"}`}
      >
        <PartnershipLockup settled={settled} />

        {settled && (
          <>
            <SlideReveal step={1}>
              <SlideKicker>Using it ourselves</SlideKicker>
            </SlideReveal>
            <BlurWordsTitle
              lines={["Eva can run on vmem."]}
              size="xl"
              step={1}
            />
            <SlideReveal step={1} delay={0.1} className="mt-4 max-w-2xl">
              <SlideBody>
                Eva is our own internal agent. Connect vmem and she remembers
                everything she has ever done.
              </SlideBody>
            </SlideReveal>

            <SlideStagger
              className="mt-8 grid grid-cols-5 gap-4"
              delayChildren={0.06}
              staggerChildren={0.1}
              step={1}
            >
              {REMEMBERS.map(({ icon: Icon, label }) => (
                <SlideItem key={label}>
                  <div className="flex h-full flex-col items-start gap-3 rounded-2xl bg-surface-secondary/60 px-4 py-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
                      <Icon size={15} stroke={1.5} />
                    </div>
                    <p className="text-sm font-medium leading-snug text-foreground">
                      {label}
                    </p>
                  </div>
                </SlideItem>
              ))}
            </SlideStagger>

            <SlideReveal step={2} className="mt-6">
              <div className="flex items-center gap-4 rounded-2xl bg-foreground px-6 py-5 text-background">
                <EvaIcon size={28} className="shrink-0 rounded-md" />
                <p className="text-base leading-relaxed">
                  She keeps getting better as the data vmem holds grows —
                  improving with every task, learning from every mistake.
                </p>
              </div>
            </SlideReveal>
          </>
        )}
      </div>
    </SlideShell>
  );
}
