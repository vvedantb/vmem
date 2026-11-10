import type { ComponentType } from "react";
import type { Accept } from "react-dropzone";
import ClaudeLogo from "./ClaudeLogo";
import ChatGptLogo from "./ChatGptLogo";
import GrokLogo from "./GrokLogo";
import DeepSeekLogo from "./DeepSeekLogo";
import GeminiLogo from "./GeminiLogo";
import PerplexityLogo from "./PerplexityLogo";
import { parseChatGptExportBuffer } from "@/lib/chat-export/parseChatGptExport";
import { parseClaudeExportBuffer } from "@/lib/chat-export/parseClaudeExport";
import { parseGrokExportBuffer } from "@/lib/chat-export/parseGrokExport";
import { parseDeepSeekExportBuffer } from "@/lib/chat-export/parseDeepSeekExport";
import type { ExportImportRow } from "@/lib/chat-export/importRows";

type ParseResult =
  | { ok: true; rows: ExportImportRow[] }
  | { ok: false; error: string };

type LogoProps = { className?: string };

const zipOrJsonAccept: Accept = {
  "application/zip": [".zip"],
  "application/json": [".json"],
};

type ProviderBase = {
  id: string;
  label: string;
  description: string;
  Logo: ComponentType<LogoProps>;
  logoClassName: string;
};

export type AvailableProvider = ProviderBase & {
  kind: "available";
  parser: (buffer: ArrayBuffer) => ParseResult;
  instructions: { title: string; steps: string[]; accept: Accept };
  source: string;
  tag: string;
};

export type ComingSoonProvider = ProviderBase & { kind: "coming-soon" };

export type ImportProvider = AvailableProvider | ComingSoonProvider;

export const importProviders: readonly ImportProvider[] = [
  {
    id: "chatgpt",
    kind: "available",
    label: "ChatGPT",
    Logo: ChatGptLogo,
    logoClassName: "text-foreground",
    description:
      "Upload the file you get from ChatGPT's export. Choose which chats to keep here so they are easy to find later.",
    parser: parseChatGptExportBuffer,
    source: "import:chatgpt",
    tag: "chatgpt",
    instructions: {
      title: "ChatGPT export",
      steps: [
        "Open ChatGPT → Settings → Data controls → Export data.",
        "Confirm export and download the ZIP when it is ready.",
        "Upload that ZIP here, or extract it and upload conversations.json.",
      ],
      accept: zipOrJsonAccept,
    },
  },
  {
    id: "claude",
    kind: "available",
    label: "Claude",
    Logo: ClaudeLogo,
    logoClassName: "text-[#D97757] dark:text-[#EA9A7A]",
    description:
      "Upload your Claude export from Settings → Privacy. Choose which conversations to keep; they are saved with your other material here for later.",
    parser: parseClaudeExportBuffer,
    source: "import:claude",
    tag: "claude",
    instructions: {
      title: "Claude export",
      steps: [
        "Open Claude on the web → Settings → Privacy → Export data.",
        "Use the email download link within 24 hours and save the archive.",
        "Upload the ZIP or the JSON file from the export.",
      ],
      accept: zipOrJsonAccept,
    },
  },
  {
    id: "grok",
    kind: "available",
    label: "Grok",
    Logo: GrokLogo,
    logoClassName: "text-foreground",
    description:
      "Upload your Grok export. Choose which conversations to keep; they are saved with your other material here for later.",
    parser: parseGrokExportBuffer,
    source: "import:grok",
    tag: "grok",
    instructions: {
      title: "Grok export",
      steps: [
        "Open Grok on the web → Settings → Data Controls → Download your data.",
        "Use the download link when the export is ready and save the archive.",
        "Upload the ZIP or the JSON file from the export.",
      ],
      accept: zipOrJsonAccept,
    },
  },
  {
    id: "deepseek",
    kind: "available",
    label: "DeepSeek",
    Logo: DeepSeekLogo,
    logoClassName: "text-[#4D6BFE]",
    description:
      "Upload your DeepSeek export. Choose which conversations to keep; they are saved with your other material here for later.",
    parser: parseDeepSeekExportBuffer,
    source: "import:deepseek",
    tag: "deepseek",
    instructions: {
      title: "DeepSeek export",
      steps: [
        "Open DeepSeek on the web → Settings → Data → Export data.",
        "Download the archive when the export is ready.",
        "Upload the ZIP or the JSON file from the export.",
      ],
      accept: zipOrJsonAccept,
    },
  },
  {
    id: "gemini",
    kind: "coming-soon",
    label: "Gemini",
    Logo: GeminiLogo,
    logoClassName: "text-[#4285F4]",
    description: "Google Takeout export — support coming soon.",
  },
  {
    id: "perplexity",
    kind: "coming-soon",
    label: "Perplexity",
    Logo: PerplexityLogo,
    logoClassName: "text-[#20808D]",
    description: "Perplexity does not yet offer a bulk export. Support coming soon.",
  },
];
