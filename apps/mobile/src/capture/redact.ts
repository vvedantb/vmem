/** Replaces the value of a secret. Patterns are few and high-signal on purpose. */
const MASK = "[redacted]";

const SECRET_PATTERNS: readonly RegExp[] = [
  /\bvmem_sk_[A-Za-z0-9_-]+/g,
  // OpenAI-style keys, including sk-proj-… and sk-ant-…
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\b(?:ghp|gho|ghs)_[A-Za-z0-9]{30,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{30,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi,
  // JWT: three base64url parts, the first two start with "eyJ".
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];

/** A 4 to 8 digit code next to a word like "code" or "OTP". */
const CODE_AFTER_KEYWORD =
  /\b(code|otp|passcode|pin|verification|one-time)(\D{0,20}?)\b\d{4,8}\b/gi;
/** The whole text is only a 4 to 8 digit code (with optional spaces or a dash). */
const BARE_CODE = /^\s*\d{3,4}[\s-]?\d{1,4}\s*$/;

/** Removes obvious secrets (API keys, tokens, one-time codes) before a capture is queued. */
export function redactSecrets(text: string): string {
  if (BARE_CODE.test(text)) return MASK;
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, MASK);
  return out.replace(CODE_AFTER_KEYWORD, `$1$2${MASK}`);
}
