/**
 * Brand mark for a local LLM provider (Qwen, Llama, DeepSeek, Gemma).
 * Assets live in `public/model-providers/` (sourced from https://svgl.app).
 */
import {
  getProviderIconSrc,
  getQwenIconSrc,
} from "@/lib/local-model-providers";

interface LocalModelProviderIconProps {
  provider: string;
  size?: number;
  className?: string;
}

export default function LocalModelProviderIcon({
  provider,
  size = 16,
  className = "",
}: LocalModelProviderIconProps) {
  if (provider === "Qwen") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <img
          src={getQwenIconSrc("light")}
          alt=""
          width={size}
          height={size}
          className="dark:hidden"
        />
        <img
          src={getQwenIconSrc("dark")}
          alt=""
          width={size}
          height={size}
          className="hidden dark:block"
        />
      </span>
    );
  }

  const src = getProviderIconSrc(provider);
  if (src === null) return null;

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`inline-block shrink-0 ${className}`}
      aria-hidden
    />
  );
}
