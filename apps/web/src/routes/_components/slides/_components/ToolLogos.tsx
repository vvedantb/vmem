import { IconWorld } from "@tabler/icons-react";
import ClaudeLogo from "@/components/settings/ClaudeLogo";

/**
 * Brand marks for the tools that appear in the fragmentation beat
 * (frag-scatter + frag-collapse). Monochrome marks (OpenAI, Grok) are
 * `currentColor`-driven, so the caller sets the colour; the rest are the
 * brands' own colours (Claude terracotta, Gemini gradient, Microsoft squares).
 * Gemini/Microsoft logos live in `public/` (sourced from https://svgl.app).
 */

export type ToolKey =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "copilot"
  | "browser"
  | "grok"
  | "linear"
  | "sharepoint"
  | "teams"
  | "notion";

/** OpenAI / ChatGPT mark (monochrome — coloured via `currentColor`). */
function OpenAiMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 260"
      className={className}
      aria-hidden
      fill="currentColor"
    >
      <path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z" />
    </svg>
  );
}

/** Grok (xAI) mark (monochrome — coloured via `currentColor`). */
function GrokMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className={className}
      aria-hidden
      fill="currentColor"
    >
      <path d="M395.479 633.828L735.91 381.105C752.599 368.715 776.454 373.548 784.406 392.792C826.26 494.285 807.561 616.253 724.288 699.996C641.016 783.739 525.151 802.104 419.247 760.277L303.556 814.143C469.49 928.202 670.987 899.995 796.901 773.282C896.776 672.843 927.708 535.937 898.785 412.476L899.047 412.739C857.105 231.37 909.358 158.874 1016.4 10.6326C1018.93 7.11771 1021.47 3.60279 1024 0L883.144 141.651V141.212L395.392 633.916" />
      <path d="M325.226 695.251C206.128 580.84 226.662 403.776 328.285 301.668C403.431 226.097 526.549 195.254 634.026 240.596L749.454 186.994C728.657 171.88 702.007 155.623 671.424 144.2C533.19 86.9942 367.693 115.465 255.323 228.382C147.234 337.081 113.244 504.215 171.613 646.833C215.216 753.423 143.739 828.818 71.7385 904.916C46.2237 931.893 20.6216 958.87 0 987.429L325.139 695.339" />
    </svg>
  );
}

interface ToolLogoProps {
  tool: ToolKey;
  /** Sizing classes (e.g. "h-5 w-5"). Also drives colour for monochrome marks. */
  className?: string;
}

/** Renders the brand mark for a tool key at the given size. */
export function ToolLogo({ tool, className = "" }: ToolLogoProps) {
  switch (tool) {
    case "chatgpt":
      return <OpenAiMark className={className} />;
    case "grok":
      return <GrokMark className={className} />;
    case "claude":
      return <ClaudeLogo className={`${className} text-[#D97757]`} />;
    case "gemini":
      return (
        <img
          src="/slides/logo-gemini.svg"
          alt=""
          aria-hidden
          className={className}
        />
      );
    case "copilot":
      return (
        <img
          src="/model-providers/microsoft.svg"
          alt=""
          aria-hidden
          className={className}
        />
      );
    case "browser":
      return <IconWorld stroke={1.5} className={className} />;
    case "linear":
      return (
        <img
          src="/slides/logo-linear.svg"
          alt=""
          aria-hidden
          className={className}
        />
      );
    case "sharepoint":
      return (
        <img
          src="/slides/logo-sharepoint.svg"
          alt=""
          aria-hidden
          className={className}
        />
      );
    case "teams":
      return (
        <img
          src="/slides/logo-teams.svg"
          alt=""
          aria-hidden
          className={className}
        />
      );
    case "notion":
      return (
        <img
          src="/slides/logo-notion.svg"
          alt=""
          aria-hidden
          className={className}
        />
      );
  }
}
