import { contentTokens, stem, tokenize, uniqueTokens } from "./tokens";

const CLUSTERS: readonly (readonly string[])[] = [
  ["pnpm", "npm", "yarn", "package", "packages", "packagemanager"],
  [
    "helix",
    "neovim",
    "nvim",
    "vim",
    "zed",
    "vscode",
    "editor",
    "editors",
    "ide",
  ],
  [
    "dark",
    "darkmode",
    "theme",
    "themes",
    "colorscheme",
    "colourscheme",
    "color",
    "colour",
    "scheme",
  ],
  ["typescript", "javascript", "js", "ts"],
  ["convex", "database", "backend"],
  [
    "coffee",
    "latte",
    "espresso",
    "cappuccino",
    "drink",
    "beverage",
    "caffeine",
    "oat",
  ],
  [
    "prefer",
    "prefers",
    "preferred",
    "preference",
    "like",
    "likes",
    "liked",
    "favorite",
    "favourite",
  ],
  ["install", "installs", "installed", "installation"],
  ["london", "uk", "britain", "england", "live", "lives", "based"],
  ["dog", "dogs", "puppy", "pet", "pets", "maple"],
  ["run", "runs", "running", "jog", "jogging", "5k"],
  ["react", "frontend", "ui"],
  ["alice", "person", "people"],
];

const PHRASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["package manager", ["pnpm", "npm", "yarn", "package"]],
  ["javascript packages", ["pnpm", "npm", "yarn", "package"]],
  ["node packages", ["pnpm", "npm", "yarn", "package"]],
  ["text editor", ["editor", "helix", "neovim", "vim", "zed"]],
  ["code editor", ["editor", "helix", "neovim", "vim", "zed"]],
  ["color scheme", ["theme", "dark", "light"]],
  ["colour scheme", ["theme", "dark", "light"]],
  ["dark mode", ["dark", "theme"]],
  ["light mode", ["light", "theme"]],
  ["work out", ["workout", "workouts"]],
  ["where live", ["london", "uk"]],
];

const TOKEN_TO_CLUSTER: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, readonly string[]>();
  for (const cluster of CLUSTERS) {
    const stemmed = uniqueTokens(cluster.map(stem));
    for (const token of stemmed) {
      map.set(token, stemmed);
    }
    for (const raw of cluster) {
      map.set(stem(raw), stemmed);
    }
  }
  return map;
})();

function phraseKey(text: string): string {
  return contentTokens(text, false).join(" ");
}

const PHRASE_LOOKUP: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, readonly string[]>();
  for (const [phrase, extras] of PHRASES) {
    map.set(phraseKey(phrase), extras.map(stem));
  }
  return map;
})();

export function expandQueryTerms(query: string): string[] {
  const rawTokens = tokenize(query);
  const stemmed = contentTokens(query, true);
  const extras: string[] = [];

  for (let i = 0; i < rawTokens.length - 1; i += 1) {
    const two = phraseKey(`${rawTokens[i] ?? ""} ${rawTokens[i + 1] ?? ""}`);
    const hit = PHRASE_LOOKUP.get(two);
    if (hit !== undefined) extras.push(...hit);
  }

  for (const token of stemmed) {
    const cluster = TOKEN_TO_CLUSTER.get(token);
    if (cluster !== undefined) extras.push(...cluster);
  }

  return uniqueTokens([...stemmed, ...extras]);
}

export function expandedSearchText(query: string): string {
  const original = tokenize(query);
  const expanded = expandQueryTerms(query);
  return uniqueTokens([...original, ...expanded]).join(" ");
}
