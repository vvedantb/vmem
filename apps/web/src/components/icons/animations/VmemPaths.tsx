import "./vmem-anim.css";

// raw `d` strings for the three vmem logo petals
const PATH_LEFT =
  "M81.3835 181.779C22.2397 161.586 13.4909 102.411 36.5078 61.7585L25.0687 36.241C-10.1246 81.7999 -19.3022 165.229 71.8802 203.249L81.3835 181.779Z";
const PATH_RIGHT =
  "M128.109 181.779C187.253 161.586 196.002 102.411 172.985 61.7585L184.424 36.241C219.617 81.7999 228.795 165.229 137.612 203.249L128.109 181.779Z";
const PATH_TOP =
  "M156.866 14.2622C115.857 -4.51398 93.2253 -4.72022 53.5056 13.461L63.1205 36.2163C92.2894 19.6073 110.744 19.1365 147.571 34.774L156.866 14.2622Z";

interface VmemPathsProps {
  // class applied to every petal — combine with `:nth-child` selectors
  pathClassName?: string;
  // per petal classes when you need to target individuals by name
  leftClassName?: string;
  rightClassName?: string;
  topClassName?: string;
  // `pathLength="100"` lets every stroke animation use a normalised 0 100 dasharray
  normalizePath?: boolean;
}

// renders the three logo petals as `<path>` siblings inside any parent `<svg>`
export function VmemPaths({
  pathClassName,
  leftClassName,
  rightClassName,
  topClassName,
  normalizePath,
}: VmemPathsProps) {
  const lengthAttr = normalizePath ? { pathLength: 100 } : {};
  return (
    <>
      <path
        d={PATH_LEFT}
        fill="currentColor"
        className={[pathClassName, leftClassName].filter(Boolean).join(" ")}
        {...lengthAttr}
      />
      <path
        d={PATH_RIGHT}
        fill="currentColor"
        className={[pathClassName, rightClassName].filter(Boolean).join(" ")}
        {...lengthAttr}
      />
      <path
        d={PATH_TOP}
        fill="currentColor"
        className={[pathClassName, topClassName].filter(Boolean).join(" ")}
        {...lengthAttr}
      />
    </>
  );
}
