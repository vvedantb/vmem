"use client";

/**
 * Curated Shiki code-highlighter plugin for Streamdown.
 *
 * The stock `@streamdown/code` plugin builds its highlighter with
 * `createHighlighter` from Shiki's *full* entry, which statically references
 * `bundledLanguages` — Shiki's registry of ~200 grammars. The bundler then has
 * to emit a chunk for every grammar. Those chunks are lazy at runtime, but at
 * build time they still inflate the module graph (10k+ modules) and the Vite
 * dependency cache, which is what makes the Vercel "create build cache" step
 * take minutes.
 *
 * This plugin instead builds the highlighter with `createHighlighterCore`
 * (which references no bundle) and a hand-picked grammar set, so only the
 * languages we actually render in chat/reasoning output get bundled. It
 * implements the exact `CodeHighlighterPlugin` contract Streamdown expects, so
 * it drops in as the `code` plugin. Anything outside the curated set is
 * highlighted as plain text.
 *
 * Themes are fixed to github-light/github-dark to match Streamdown's defaults
 * (our usages don't override `shikiTheme`).
 */

import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type {
  BundledLanguage,
  CodeHighlighterPlugin,
  ThemeInput,
} from "streamdown";

import githubLight from "@shikijs/themes/github-light";
import githubDark from "@shikijs/themes/github-dark";

import typescript from "@shikijs/langs/typescript";
import tsx from "@shikijs/langs/tsx";
import javascript from "@shikijs/langs/javascript";
import jsx from "@shikijs/langs/jsx";
import json from "@shikijs/langs/json";
import jsonc from "@shikijs/langs/jsonc";
import html from "@shikijs/langs/html";
import css from "@shikijs/langs/css";
import python from "@shikijs/langs/python";
import bash from "@shikijs/langs/bash";
import shellscript from "@shikijs/langs/shellscript";
import yaml from "@shikijs/langs/yaml";
import markdown from "@shikijs/langs/markdown";
import sql from "@shikijs/langs/sql";
import cypher from "@shikijs/langs/cypher";
import go from "@shikijs/langs/go";
import rust from "@shikijs/langs/rust";
import java from "@shikijs/langs/java";
import c from "@shikijs/langs/c";
import cpp from "@shikijs/langs/cpp";
import ruby from "@shikijs/langs/ruby";
import diff from "@shikijs/langs/diff";
import dockerfile from "@shikijs/langs/dockerfile";
import toml from "@shikijs/langs/toml";

const PLAIN_TEXT = "text";

/** Theme names loaded into the highlighter; passed to `codeToTokens`. */
const THEME_NAMES = { light: "github-light", dark: "github-dark" };

/** Themes returned to Streamdown via `getThemes()`. */
const THEMES: [ThemeInput, ThemeInput] = [githubLight, githubDark];

/**
 * Canonical grammar ids we register. Typed as `BundledLanguage[]` so
 * `getSupportedLanguages` satisfies the plugin contract without a cast.
 */
const SUPPORTED_LANGUAGES: BundledLanguage[] = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "jsonc",
  "html",
  "css",
  "python",
  "bash",
  "shellscript",
  "yaml",
  "markdown",
  "sql",
  "cypher",
  "go",
  "rust",
  "java",
  "c",
  "cpp",
  "ruby",
  "diff",
  "dockerfile",
  "toml",
];

const supportedSet = new Set<string>(SUPPORTED_LANGUAGES);

/** Common aliases → canonical grammar id. */
const LANGUAGE_ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  golang: "go",
  docker: "dockerfile",
  rb: "ruby",
};

function normalizeLanguage(language: string): string {
  const id = language.trim().toLowerCase();
  return LANGUAGE_ALIASES[id] ?? id;
}

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [githubLight, githubDark],
      langs: [
        typescript,
        tsx,
        javascript,
        jsx,
        json,
        jsonc,
        html,
        css,
        python,
        bash,
        shellscript,
        yaml,
        markdown,
        sql,
        cypher,
        go,
        rust,
        java,
        c,
        cpp,
        ruby,
        diff,
        dockerfile,
        toml,
      ],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  }
  return highlighterPromise;
}

type CodeTokens = ReturnType<HighlighterCore["codeToTokens"]>;

// Cache highlight results and de-duplicate pending callbacks per (lang, code).
// Streamdown calls `highlight` synchronously and expects either a cached result
// or `null` + a callback that fires once the async highlighter resolves.
const resultCache = new Map<string, CodeTokens>();
const pendingCallbacks = new Map<string, Set<(result: CodeTokens) => void>>();

function cacheKey(language: string, code: string): string {
  const head = code.slice(0, 100);
  const tail = code.length > 100 ? code.slice(-100) : "";
  return `${language}:${code.length}:${head}:${tail}`;
}

export const code: CodeHighlighterPlugin = {
  name: "shiki",
  type: "code-highlighter",
  getSupportedLanguages() {
    return SUPPORTED_LANGUAGES;
  },
  getThemes() {
    return THEMES;
  },
  supportsLanguage(language) {
    return supportedSet.has(normalizeLanguage(language));
  },
  highlight({ code: source, language }, callback) {
    const normalized = normalizeLanguage(language);
    const lang = supportedSet.has(normalized) ? normalized : PLAIN_TEXT;
    const key = cacheKey(lang, source);

    const cached = resultCache.get(key);
    if (cached) return cached;

    if (callback) {
      const callbacks = pendingCallbacks.get(key) ?? new Set();
      callbacks.add(callback);
      pendingCallbacks.set(key, callbacks);
    }

    getHighlighter()
      .then((highlighter) => {
        const result = highlighter.codeToTokens(source, {
          lang,
          themes: THEME_NAMES,
        });
        resultCache.set(key, result);
        const callbacks = pendingCallbacks.get(key);
        if (callbacks) {
          for (const cb of callbacks) cb(result);
          pendingCallbacks.delete(key);
        }
      })
      .catch((error) => {
        console.error("[vmem code highlighter] failed to highlight:", error);
        pendingCallbacks.delete(key);
      });

    return null;
  },
};
