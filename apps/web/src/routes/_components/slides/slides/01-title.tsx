import { useContext } from "react";
import { motion } from "motion/react";
import { VmemBrand } from "@/components/VmemBrand";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { SlideAmbientGraph } from "../_components/SlideAmbientGraph";
import {
  SlideShell,
  SlideBody,
  SlideStepContext,
} from "../_components/SlideShell";

/**
 * Title entrance, choreographed in three auto-advancing beats:
 *  step 0 — the vmem brand sits alone in the dead centre of the stage
 *  step 1 — the title + subtitle mount below, so the brand glides up to its
 *           resting spot (motion `layout`) and the copy fades in just after
 *  step 2 — the ambient graph draws itself in behind everything, last
 */
export function Slide01Title() {
  const step = useContext(SlideStepContext);
  const settled = step >= 1;

  return (
    <SlideShell center>
      {/* Graph lines draw in LAST (step 2), behind the title. */}
      {step >= 2 && (
        <SlideAmbientGraph
          animateDraw
          className="[-webkit-mask-image:radial-gradient(ellipse_58%_54%_at_50%_50%,transparent_34%,black_72%)] [mask-image:radial-gradient(ellipse_58%_54%_at_50%_50%,transparent_34%,black_72%)]"
        />
      )}

      <div className="relative z-10 flex flex-col items-center text-center">
        {/* Brand: centred alone at first, glides up once the copy mounts. */}
        <motion.div
          layout
          transition={{ layout: { duration: 0.7, ease: [0.4, 0, 0.2, 1] } }}
          className={settled ? "mb-6" : ""}
        >
          <VmemBrand iconSize={40} textClassName="text-4xl" />
        </motion.div>

        {settled && (
          <>
            <BlurWordsTitle
              lines={["Remember everything", "you tell your AI."]}
              size="3xl"
              delay={0.3}
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: 0.5 }}
              className="mt-6 max-w-xl"
            >
              <SlideBody>
                vmem captures what you tell Claude, your agents, your extension,
                and your phone — then hands it back, already connected, the next
                time you ask.
              </SlideBody>
            </motion.div>
          </>
        )}
      </div>

      {settled && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="absolute bottom-10 left-0 right-0 flex justify-center"
        >
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted/60">
            Vedant Bhopatrao
          </p>
        </motion.div>
      )}
    </SlideShell>
  );
}
