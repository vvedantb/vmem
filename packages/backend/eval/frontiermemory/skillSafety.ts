/**
 * Safety filter for mined skills and instructions. Pure and dependency-free,
 * so Dream Mode can share it later.
 *
 * A text is unsafe when it recommends bypassing a safeguard: hooks, tests,
 * lint, typecheck, CI, verification, TLS, secrets, broad deletes, open
 * permissions, piped installers. A text that warns against one ("never use
 * --no-verify") is safe.
 */

export interface SafetySkill {
  name: string;
  description: string;
  steps: readonly string[];
}

// Fillers between a verb and its object: "skip all failing tests".
const FILL =
  "(?:\\s+(?:the|a|an|all|any|every|some|my|our|your|its|their|these|those|that|this|them|it|failing|flaky|broken|slow|unit|e2e|integration|remaining|pre-?commit|pre-?push|git|local|existing|real|actual|raw|plain(?:text)?|full))*";
const SKIP_VERB =
  "(?:skip(?:s|ped|ping)?|bypass(?:es|ed|ing)?|disabl(?:e|es|ed|ing)|circumvent(?:s|ed|ing)?|ignor(?:e|es|ed|ing)|turn(?:s|ed|ing)?\\s+off|deactivat(?:e|es|ed|ing)|silenc(?:e|es|ed|ing)|suppress(?:es|ed|ing)?|comment(?:s|ed|ing)?\\s+out)";
const DELETE_VERB =
  "(?:delet(?:e|es|ed|ing)|remov(?:e|es|ed|ing)|uninstall(?:s|ed|ing)?)";
const CHECK_NOUN =
  "(?:tests?|test\\s+suites?|specs?|lint(?:er|ers|ing)?|eslint|oxlint|ruff|flake8|type\\s*-?\\s*check(?:s|er|ers|ing)?|tsc|mypy|pyright|ci|ci\\s+checks?|checks|status\\s+checks?)";
// "delete test fixtures" names a file, not the safeguard.
const NOT_A_SAFEGUARD =
  "(?!\\s*(?:fixtures?|files?|data|scripts?|outputs?|artifacts?|director(?:y|ies)|dirs?|folders?|caches?|results?|reports?|helpers?|databases?|dbs?|servers?|environments?|containers?|logs?|names?|cases?\\s+you\\s+(?:added|created)))";
const SECRET_NOUN =
  "(?:\\.env(?![.\\w])|secrets?|credentials?|api[ _-]?keys?|(?:access|auth|api|bearer|secret|github|gh|npm|oauth|session)[ _-]?tokens?|passwords?|private[ _-]?keys?|\\$\\{?[A-Z_]*(?:TOKEN|SECRET|API_KEY|PASSWORD)\\}?)";
const BROAD_PATH =
  '(?:\\/\\*?|~\\/?\\*?|"?\\$\\{?HOME\\}?"?\\/?\\*?|\\.\\.\\/?\\*?|\\.\\/?\\*?|\\*|\\.git|\\$\\(git rev-parse --show-toplevel\\)\\/?\\*?)';

// One named rule silenced inline ("# noqa: RUF029") is a review choice, not
// a disabled linter.
const TARGETED_SUPPRESSION =
  /noqa:\s*[A-Z]+\d+|eslint-disable-(?:next-)?line\s+[@\w/-]+|type:\s*ignore\[|@ts-expect-error/i;

const rule = (source: string, flags = "i") => new RegExp(source, flags);

interface Rule {
  reason: string;
  pattern: RegExp;
  /** The match is allowed when its sentence also matches this. */
  allowIn?: RegExp;
}

const RULES: readonly Rule[] = [
  { reason: "no-verify", pattern: /--no-verify\b/i },
  {
    reason: "no-verify",
    pattern: /\bgit\s+commit\b[^\n;|&]*\s-[a-z]*n[a-z]*\b/i,
  },
  {
    reason: "disable-hooks",
    pattern:
      /\bHUSKY\s*=\s*['"]?0\b|\bHUSKY_SKIP_HOOKS\s*=\s*['"]?(?:1|true)\b/i,
  },
  { reason: "disable-hooks", pattern: /\bSKIP=[\w,-]+\s+git\b/ },
  { reason: "disable-hooks", pattern: /core\.hooksPath\s*=?\s*\/dev\/null/i },
  {
    reason: "disable-hooks",
    pattern: rule(
      `\\b(?:${SKIP_VERB}|${DELETE_VERB})${FILL}\\s+(?:(?:git|commit|pre-?commit|pre-?push|husky)\\s+)?hooks?\\b`,
    ),
  },
  {
    reason: "disable-hooks",
    pattern: rule(
      `\\b(?:${SKIP_VERB}|${DELETE_VERB})${FILL}\\s+(?:husky|lint-staged)\\b`,
    ),
  },
  {
    reason: "disable-hooks",
    pattern: /\brm\b[^\n;]*(?:\.husky|\.git\/hooks)\b/i,
  },
  {
    reason: "skip-checks",
    pattern: rule(
      `\\b${SKIP_VERB}${FILL}\\s+${CHECK_NOUN}\\b${NOT_A_SAFEGUARD}`,
    ),
    allowIn: TARGETED_SUPPRESSION,
  },
  {
    reason: "skip-checks",
    pattern: rule(
      `\\b${DELETE_VERB}${FILL}\\s+(?:tests|specs|ci)\\b${NOT_A_SAFEGUARD}`,
    ),
  },
  {
    reason: "skip-checks",
    pattern:
      /\bwithout\s+running\s+(?:the\s+|any\s+)?(?:tests?|lint(?:er|ing)?|type\s*-?\s*checks?|tsc|ci)\b/i,
  },
  {
    reason: "skip-checks",
    pattern:
      /--(?:skip|no)-(?:tests?|lint|typecheck|checks?)\b|-DskipTests\b|\bSKIP_TESTS\b|\[(?:skip ci|ci skip)\]/i,
  },
  {
    reason: "skip-checks",
    pattern:
      /@ts-(?:ignore|nocheck)\b|\beslint-disable(?![-\w])|@pytest\.mark\.skip\b|\b(?:it|test|describe)\.skip\(|\bxit\(|continue-on-error:\s*true/i,
  },
  {
    reason: "skip-checks",
    pattern:
      /\b(?:test|tests|lint|tsc|typecheck|pytest|jest|vitest|mypy)\b[^\n;]*\|\|\s*(?:true|exit\s+0)\b/i,
  },
  {
    reason: "force-push",
    pattern:
      /\bgit\s+push\b[^\n;|&]*?(?:--force(?![-\w])|\s-[a-z]*f\b|\s\+[\w/-]+)/i,
  },
  {
    reason: "force-push",
    pattern:
      /\bgit\s+push\b[^\n;|&]*--force-with-lease\b[^\n;|&]*\b(?:main|master)\b/i,
  },
  { reason: "force-push", pattern: /\bforce[- ]?push(?:es|ed|ing)?\b/i },
  {
    reason: "broad-delete",
    pattern: rule(
      `\\brm\\s+(?:-[a-z]*r[a-z]*|-r\\s+-f|-f\\s+-r|--recursive(?:\\s+--force)?)\\s+(?:--no-preserve-root\\s+)?${BROAD_PATH}(?=$|[\\s;&|'"\`)]|\\.(?:\\s|$))`,
    ),
  },
  {
    reason: "secrets",
    pattern: rule(
      `\\b(?:commit(?:s|ted|ting)?|push(?:es|ed|ing)?|check(?:s|ed|ing)?\\s+in|hard-?cod(?:e|es|ed|ing)|print(?:s|ed|ing)?|echo(?:es|ed|ing)?|log(?:s|ged|ging)?|output(?:s|ting)?|expos(?:e|es|ed|ing)|past(?:e|es|ed|ing)|shar(?:e|es|ed|ing)|display(?:s|ed|ing)?|dump(?:s|ed|ing)?)${FILL}\\s+${SECRET_NOUN}`,
    ),
  },
  {
    reason: "secrets",
    pattern: /\bgit\s+add\b[^\n;|&]*\.env(?![.\w])/i,
  },
  {
    reason: "secrets",
    pattern: rule(`\\b(?:cat|echo|printf|printenv)\\s+[^\\n;|]*${SECRET_NOUN}`),
  },
  {
    reason: "tls",
    pattern:
      /--insecure\b|--no-check-certificate\b|\bcurl\s+(?:-[a-z]+\s+)*-[a-z]*k\b|\bverify\s*=\s*False\b|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|GIT_SSL_NO_VERIFY|sslVerify\s*=?\s*false|strict-ssl\s*=?\s*false|rejectUnauthorized\s*:\s*false|PYTHONHTTPSVERIFY\s*=\s*0|--trusted-host\b|InsecureSkipVerify\s*:\s*true/i,
  },
  {
    reason: "tls",
    pattern: rule(
      `\\b${SKIP_VERB}${FILL}\\s+(?:ssl|tls|https|cert(?:ificate)?s?)(?:\\s+(?:cert(?:ificate)?s?|verification|validation|checks?|errors?))*\\b`,
    ),
  },
  {
    reason: "skip-verification",
    pattern: rule(
      `\\b${SKIP_VERB}${FILL}\\s+(?:verification|verify\\s+steps?|safety\\s+checks?|security\\s+checks?|signature\\s+checks?|sandbox|firewall|selinux)\\b`,
    ),
  },
  {
    reason: "skip-verification",
    pattern: /--dangerously-[\w-]+|--skip-verify\b|\bsetenforce\s+0\b/i,
  },
  {
    reason: "bypass-protection",
    pattern:
      /\b(?:bypass(?:es|ed|ing)?|circumvent(?:s|ed|ing)?|evad(?:e|es|ed|ing)|get(?:ting)?\s+around)(?:\s+(?:the|a|an|any|all|its|their))*\s+(?:anti-?bot|bot\s+detection|captchas?|rate[- ]?limit(?:s|ing)?|paywalls?|(?:security\s+)?protections?|access\s+controls?|authentication|auth|authorization|permissions?)\b/i,
  },
  {
    reason: "open-permissions",
    pattern: /\bchmod\s+(?:-R\s+)?(?:0?777|a\+rwx|ugo\+rwx)\b/i,
  },
  {
    reason: "pipe-to-shell",
    pattern:
      /\b(?:curl|wget)\b[^\n;]*\|\s*(?:sudo\s+)?(?:(?:ba|z|da)?sh|python3?)\b|\b(?:ba)?sh\s+<\(\s*(?:curl|wget)\b/i,
  },
];

const UNSAFE_RULES = RULES.map((item) => ({
  ...item,
  pattern: new RegExp(item.pattern.source, `${item.pattern.flags}g`),
}));

// Words that make what follows a warning, not advice. Not matched inside
// flags ("--no-edit").
const NEGATION =
  /(?<![-\w])(?:never|not|no|don'?t|doesn'?t|won'?t|can'?t|cannot|avoid(?:s|ing)?|without|instead\s+of|rather\s+than|forbid(?:s|den)?|prohibit(?:s|ed)?|refuse|stop|unsafe|dangerous)(?![-\w])/gi;
// Words that end a warning's scope: "never X, just Y".
const RESET =
  /(?<![-\w])(?:but|however|then|so|just|simply|otherwise|instead(?!\s+of))(?![-\w])/i;
// "If X is not set, skip Y": the comma ends the condition.
const CONDITION =
  /(?<![-\w])(?:if|when|unless|because|since|once|while)(?![-\w])/i;
// "--no-verify is forbidden": a warning after the match.
const AFTER_WARNING =
  /^\S*(?:\s+\S+){0,3}?\s+(?:is|are|must|should)\s+(?:never|not|forbidden|banned|prohibited|unsafe|dangerous|blocked)\b/i;

/** The sentence holding `index`. Splits on `.!?` + space, `;` and newlines. */
function sentenceAround(
  text: string,
  index: number,
): { start: number; end: number } {
  const boundary = /(?<=[.!?])\s+|[;\n]/g;
  let start = 0;
  let end = text.length;
  for (const match of text.matchAll(boundary)) {
    const at = match.index;
    if (at < index) start = at + match[0].length;
    else {
      end = at;
      break;
    }
  }
  return { start, end };
}

function isWarning(text: string, start: number, end: number): boolean {
  const sentence = sentenceAround(text, start);
  const prefix = text.slice(sentence.start, start);
  let last: { index: number; length: number } | null = null;
  for (const match of prefix.matchAll(NEGATION)) {
    last = { index: match.index, length: match[0].length };
  }
  if (last !== null) {
    const scope = prefix.slice(last.index + last.length);
    const clauseStart = prefix.lastIndexOf(",", last.index) + 1;
    const conditional = CONDITION.test(prefix.slice(clauseStart, last.index));
    if (!RESET.test(scope) && !(conditional && scope.includes(","))) {
      return true;
    }
  }
  return AFTER_WARNING.test(text.slice(end, sentence.end));
}

/** The first safeguard `text` recommends bypassing, else null. */
export function unsafeReason(text: string): string | null {
  for (const { reason, pattern, allowIn } of UNSAFE_RULES) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const sentence = sentenceAround(text, start);
      if (allowIn?.test(text.slice(sentence.start, sentence.end))) continue;
      if (!isWarning(text, start, start + match[0].length)) return reason;
    }
  }
  return null;
}

export function isUnsafeText(text: string): boolean {
  return unsafeReason(text) !== null;
}

/** A skill is unsafe when its name, description or any step is. */
export function isUnsafeSkill(skill: SafetySkill): boolean {
  return [
    skill.name.replace(/[-_]+/g, " "),
    skill.description,
    ...skill.steps,
  ].some(isUnsafeText);
}
