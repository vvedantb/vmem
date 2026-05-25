import type { ComponentType } from "react";
import ClaudeLogo from "./ClaudeLogo";
import DeepSeekLogo from "./DeepSeekLogo";
import GeminiLogo from "./GeminiLogo";
import GrokLogo from "./GrokLogo";
import ChatGptLogo from "./ChatGptLogo";
import PerplexityLogo from "./PerplexityLogo";
import { parseChatGptExportBuffer } from "../_utils/parseChatGptExport";
import { parseClaudeExportBuffer } from "../_utils/parseClaudeExport";
import { parseDeepSeekExportBuffer } from "../_utils/parseDeepSeekExport";
import { parseGrokExportBuffer } from "../_utils/parseGrokExport";
import type { ExportImportRow } from "../_utils/importRows";

export type ParseResult =
  | { ok: true; rows: ExportImportRow[] }
  | { ok: false; error: string };

type LogoProps = { className?: string };

type BaseProvider = {
  id: string;
  label: string;
  description: string;
  Logo: ComponentType<LogoProps>;
  logoClassName: string;
};

export type AvailableProvider = BaseProvider & {
  kind: "available";
  parser: (buffer: ArrayBuffer) => ParseResult;
  instructions: { title: string; steps: string[]; accept: string };
  source: string;
  tag: string;
};

export type ComingSoonProvider = BaseProvider & {
  kind: "coming-soon";
};

export type ImportProvider = AvailableProvider | ComingSoonProvider;

export const importProviders: readonly ImportProvider[] = [
  {
    kind: "available",
    id: "chatgpt",
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
      accept: ".zip,.json,application/zip,application/json",
    },
  },
  {
    kind: "available",
    id: "claude",
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
      accept: ".zip,.json,application/zip,application/json",
    },
  },
  {
    kind: "available",
    id: "grok",
    label: "Grok",
    Logo: GrokLogo,
    logoClassName: "text-foreground",
    description:
      "Upload your Grok conversation export. Choose which chats to keep so you can find them again later.",
    parser: parseGrokExportBuffer,
    source: "import:grok",
    tag: "grok",
    instructions: {
      title: "Grok export",
      steps: [
        "Open Grok on the web → Settings → Data → Export conversations.",
        "Download the archive when it is ready.",
        "Upload the ZIP or the JSON file from the export.",
      ],
      accept: ".zip,.json,application/zip,application/json",
    },
  },
  {
    kind: "available",
    id: "deepseek",
    label: "DeepSeek",
    Logo: DeepSeekLogo,
    logoClassName: "text-[#4D6BFE]",
    description:
      "Upload your DeepSeek conversation export. Pick the chats you want to keep so they are searchable later.",
    parser: parseDeepSeekExportBuffer,
    source: "import:deepseek",
    tag: "deepseek",
    instructions: {
      title: "DeepSeek export",
      steps: [
        "Open DeepSeek → Settings → Data → Export conversations.",
        "Download the archive when it is ready.",
        "Upload the ZIP or the JSON file from the export.",
      ],
      accept: ".zip,.json,application/zip,application/json",
    },
  },
  {
    kind: "coming-soon",
    id: "gemini",
    label: "Gemini",
    Logo: GeminiLogo,
    logoClassName: "text-[#4285F4]",
    description: "Google Takeout export — support coming soon.",
  },
  {
    kind: "coming-soon",
    id: "perplexity",
    label: "Perplexity",
    Logo: PerplexityLogo,
    logoClassName: "text-[#20808D]",
    description:
      "Perplexity does not yet offer a bulk export. Support coming soon.",
  },
];
