import { SvgUri } from "react-native-svg";
import { useColorScheme } from "nativewind";
import { getOpenRouterProviderIcon } from "@vmem/shared";
import { WEB_APP_URL } from "@/lib/web-app-url";

interface CloudModelProviderIconProps {
  provider: string;
  size?: number;
}

/**
 * Provider brand logo — RN port of web CloudModelProviderIcon. The SVGs live
 * in apps/web/public/model-providers and are fetched from the deployed web
 * app, so both platforms share one set of assets.
 */
export default function CloudModelProviderIcon({
  provider,
  size = 14,
}: CloudModelProviderIconProps) {
  const { colorScheme } = useColorScheme();
  const asset = getOpenRouterProviderIcon(provider);
  if (asset === null) return null;

  const path =
    asset.kind === "theme"
      ? colorScheme === "dark"
        ? asset.dark
        : asset.light
      : asset.src;

  return <SvgUri uri={`${WEB_APP_URL}${path}`} width={size} height={size} />;
}
