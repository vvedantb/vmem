import {
  IconBrandYoutube,
  IconMessageChatbot,
  IconSparkles,
  IconWorld,
} from "@tabler/icons-react";
import {
  ChromeIcon,
  CursorIcon,
  GoogleDriveIcon,
  NotionIcon,
} from "@/components/brand-icons";

type MemorySourceIconProps = {
  source: string;
  size?: number;
  className?: string;
};

export function MemorySourceIcon({
  source,
  size = 14,
  className,
}: MemorySourceIconProps) {
  switch (source) {
    case "google_drive":
      return <GoogleDriveIcon size={size} className={className} />;
    case "notion":
      return <NotionIcon size={size} className={className} />;
    case "browser-extension":
      return <ChromeIcon size={size} className={className} />;
    case "youtube":
      return (
        <IconBrandYoutube size={size} stroke={1.7} className={className} />
      );
    case "web":
      return <IconWorld size={size} stroke={1.7} className={className} />;
    case "prompt-capture":
      return (
        <IconMessageChatbot size={size} stroke={1.7} className={className} />
      );
    case "mcp":
    case "cursor":
      return <CursorIcon size={size} className={className} />;
    case "client-enrichment":
      return <IconSparkles size={size} stroke={1.7} className={className} />;
    default:
      return <IconWorld size={size} stroke={1.7} className={className} />;
  }
}
