import { motion } from "motion/react";

/**
 * Tiny looping mini-scenes shown under each pipeline stage on ?slide=04, so each
 * step reads at a glance:
 *  capture — a prompt is saved into a memory node
 *  enrich  — topics/tags get attached to the node
 *  connect — relationships form out to neighbouring memories
 *  recall  — scattered memories are pulled back in
 * All HTML/SVG in a fixed 0-100 percentage box. Mock, decorative.
 */

export type StageVisualKind = "capture" | "enrich" | "connect" | "recall";

const BOX = "relative h-16 w-full";

/** A solid dot positioned at a percentage point. */
function Dot({ l, t, big }: { l: number; t: number; big?: boolean }) {
  return (
    <span
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ${
        big ? "h-4 w-4" : "h-2.5 w-2.5"
      }`}
      style={{ left: `${l}%`, top: `${t}%` }}
    />
  );
}

/** capture — a prompt bubble emits a packet that saves into a memory node. */
function CaptureVisual() {
  return (
    <div className={BOX}>
      <div className="absolute left-0 top-1/2 w-[42%] -translate-y-1/2 space-y-1 rounded-lg bg-surface-tertiary px-2 py-2">
        <div className="h-1 w-full rounded-full bg-foreground/30" />
        <div className="h-1 w-2/3 rounded-full bg-foreground/30" />
      </div>
      <motion.div
        className="absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-foreground"
        animate={{ scale: [1, 1.14, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-foreground"
        initial={false}
        animate={{ left: ["44%", "92%"], opacity: [0, 1, 1, 0] }}
        transition={{
          duration: 2.2,
          repeat: Infinity,
          repeatDelay: 0.3,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}

/** enrich — topic/name/date tags pop on around the memory node. */
function EnrichVisual() {
  const tags = [
    { label: "topic", l: 22, t: 20 },
    { label: "name", l: 80, t: 28 },
    { label: "date", l: 58, t: 82 },
  ];
  return (
    <div className={BOX}>
      <Dot l={50} t={50} big />
      {tags.map((tag, i) => (
        <motion.span
          key={tag.label}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-tertiary px-1.5 py-0.5 text-[9px] font-medium text-foreground"
          style={{ left: `${tag.l}%`, top: `${tag.t}%` }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1, 1, 0.5] }}
          transition={{
            duration: 2.8,
            repeat: Infinity,
            delay: i * 0.45,
            ease: "easeOut",
          }}
        >
          {tag.label}
        </motion.span>
      ))}
    </div>
  );
}

/** connect — edges grow out from the node to neighbouring memories, in turn. */
function ConnectVisual() {
  const C = { l: 46, t: 54 };
  const neighbours = [
    { l: 16, t: 26 },
    { l: 86, t: 22 },
    { l: 80, t: 80 },
  ];
  return (
    <div className={BOX}>
      <svg
        className="absolute inset-0 h-full w-full text-foreground/40"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
      >
        {neighbours.map((n, i) => (
          <motion.line
            key={i}
            x1={C.l}
            y1={C.t}
            stroke="currentColor"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            initial={false}
            animate={{
              x2: [C.l, n.l, n.l, C.l],
              y2: [C.t, n.t, n.t, C.t],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 0.4,
              ease: "easeInOut",
            }}
          />
        ))}
      </svg>
      <Dot l={C.l} t={C.t} big />
      {neighbours.map((n, i) => (
        <Dot key={i} l={n.l} t={n.t} />
      ))}
    </div>
  );
}

/** recall — scattered memories flow back into one node. */
function RecallVisual() {
  const C = { l: 50, t: 50 };
  const sources = [
    { l: 12, t: 24 },
    { l: 88, t: 20 },
    { l: 16, t: 80 },
    { l: 86, t: 78 },
  ];
  return (
    <div className={BOX}>
      <Dot l={C.l} t={C.t} big />
      {sources.map((s, i) => (
        <motion.span
          key={i}
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
          initial={false}
          animate={{
            left: [`${s.l}%`, `${C.l}%`],
            top: [`${s.t}%`, `${C.t}%`],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            repeatDelay: 0.5,
            delay: i * 0.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function StageVisual({ kind }: { kind: StageVisualKind }) {
  switch (kind) {
    case "capture":
      return <CaptureVisual />;
    case "enrich":
      return <EnrichVisual />;
    case "connect":
      return <ConnectVisual />;
    case "recall":
      return <RecallVisual />;
  }
}
