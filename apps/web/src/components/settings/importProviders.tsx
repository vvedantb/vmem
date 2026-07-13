import type { ComponentType } from "react";
import ClaudeLogo from "./ClaudeLogo";
import ChatGptLogo from "./ChatGptLogo";
import { parseChatGptExportBuffer } from "../_utils/parseChatGptExport";
import { parseClaudeExportBuffer } from "../_utils/parseClaudeExport";
import type { ExportImportRow } from "../_utils/importRows";

type ParseResult =
  | { ok: true; rows: ExportImportRow[] }
  | { ok: false; error: string };

type LogoProps = { className?: string };

export type AvailableProvider = {
  kind: "available";
  id: string;
  label: string;
  description: string;
  Logo: ComponentType<LogoProps>;
  logoClassName: string;
  parser: (buffer: ArrayBuffer) => ParseResult;
  instructions: { title: string; steps: string[]; accept: string };
  source: string;
  tag: string;
};

export type ImportProvider = AvailableProvider;

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
];
