import { getOpenRouterProviderIcon } from "@/lib/open-router-model-providers";

interface CloudModelProviderIconProps {
  provider: string;
  size?: number;
  className?: string;
}

export default function CloudModelProviderIcon({
  provider,
  size = 16,
  className = "",
}: CloudModelProviderIconProps) {
  const asset = getOpenRouterProviderIcon(provider);
  if (asset === null) return null;

  if (asset.kind === "theme") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <img
          src={asset.light}
          alt=""
          width={size}
          height={size}
          className="dark:hidden"
        />
        <img
          src={asset.dark}
          alt=""
          width={size}
          height={size}
          className="hidden dark:block"
        />
      </span>
    );
  }

  return (
    <img
      src={asset.src}
      alt=""
      width={size}
      height={size}
      className={`inline-block shrink-0 ${className}`}
      aria-hidden
    />
  );
}
