// Secret redaction for text Dream saves from a session transcript. Pure. Each
// match becomes REDACTED, so an API key, token or password in a transcript
// never reaches a memory or a proposal.

export const REDACTED = "[REDACTED]";

// well-known key and token shapes, matched anywhere
const TOKEN_PATTERNS: readonly RegExp[] = [
  // PEM private keys, the whole block
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
  // vmem, OpenAI, Anthropic, OpenRouter, Stripe style keys (sk-…, sk_live_…, vmem_sk_…)
  /\b(?:vmem_)?sk[-_](?:live_|test_|proj-|ant-|or-v1-)?[A-Za-z0-9_-]{16,}/gu,
  /\b(?:pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/gu,
  // GitHub tokens
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/gu,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/gu,
  // Slack tokens
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/gu,
  // AWS access key ids
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu,
  // Google API keys
  /\bAIza[A-Za-z0-9_-]{35}\b/gu,
  // npm tokens
  /\bnpm_[A-Za-z0-9]{36}\b/gu,
  // JSON Web Tokens
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu,
];

// "Authorization: Bearer <token>" and "Bearer <token>"
const BEARER = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/giu;

// user:password@ in a URL
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/giu;

// password = value, "api_key": "value", TOKEN=value, secret: value, ...
const SECRET_ASSIGNMENT =
  /\b((?:[A-Za-z0-9]+[_-])*(?:password|passwd|pwd|passphrase|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|auth)(?:[_-][A-Za-z0-9]+)*["']?\s*(?:=|:)\s*["']?)([^\s"',;]{4,})/giu;

/** `text` with every API key, token and password replaced by REDACTED. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, REDACTED);
  out = out.replace(BEARER, `$1${REDACTED}`);
  out = out.replace(URL_CREDENTIALS, `$1${REDACTED}@`);
  out = out.replace(SECRET_ASSIGNMENT, (match, key: string, value: string) =>
    value.startsWith("[REDACTED") ? match : `${key}${REDACTED}`,
  );
  return out;
}
