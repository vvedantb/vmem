interface AnimatedSearchIconProps {
  className?: string;
  size?: number;
}

// morph loop keyframes glass → x → hold → glass
const KEY_TIMES = "0; 0.2; 0.4; 0.7; 0.9; 1";
const KEY_SPLINES = "0 0 1 1; 0.42 0 0.58 1; 0 0 1 1; 0.42 0 0.58 1; 0 0 1 1";
const DUR = "3.5s";

function MorphAnimate({ name, values }: { name: string; values: string }) {
  return (
    <animate
      attributeName={name}
      values={values}
      keyTimes={KEY_TIMES}
      keySplines={KEY_SPLINES}
      dur={DUR}
      repeatCount="indefinite"
      calcMode="spline"
    />
  );
}

export default function AnimatedSearchIcon({
  className,
  size = 20,
}: AnimatedSearchIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {
        // lens, shrinks to a point and fades during the x phase
      }
      <circle cx="10" cy="10" r="7">
        <MorphAnimate name="r" values="7; 7; 0; 0; 7; 7" />
        <MorphAnimate name="opacity" values="1; 1; 0; 0; 1; 1" />
      </circle>
      {
        // handle, repositions into the ╲ diagonal of the x
      }
      <line x1="15" y1="15" x2="21" y2="21">
        <MorphAnimate name="x1" values="15; 15; 5; 5; 15; 15" />
        <MorphAnimate name="y1" values="15; 15; 5; 5; 15; 15" />
        <MorphAnimate name="x2" values="21; 21; 19; 19; 21; 21" />
        <MorphAnimate name="y2" values="21; 21; 19; 19; 21; 21" />
      </line>
      {
        // second diagonal, starts as an invisible point at the lens centre, then draws out into the ╱ of the x returning to a zero, length point lets it cleanly disappear when the glass returns
      }
      <line x1="12" y1="12" x2="12" y2="12">
        <MorphAnimate name="x1" values="12; 12; 19; 19; 12; 12" />
        <MorphAnimate name="y1" values="12; 12; 5; 5; 12; 12" />
        <MorphAnimate name="x2" values="12; 12; 5; 5; 12; 12" />
        <MorphAnimate name="y2" values="12; 12; 19; 19; 12; 12" />
        <MorphAnimate name="opacity" values="0; 0; 1; 1; 0; 0" />
      </line>
    </svg>
  );
}
