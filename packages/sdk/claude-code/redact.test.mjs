import assert from "node:assert/strict";
import { test } from "node:test";
import { REDACTED, redactSecrets } from "./redact.mjs";

const secrets = [
  "vmem_sk_abcdefghijklmnop1234",
  "sk-ant-abcdefghijklmnopqrstu",
  "ghp_abcdefghijklmnopqrstuvwxyz0123",
  "xoxb-1234567890-abcdef",
  "AKIAABCDEFGHIJKLMNOP",
  `AIza${"a".repeat(35)}`,
  `npm_${"a".repeat(36)}`,
  "eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4",
];

void test("redacts well-known key and token shapes", () => {
  for (const secret of secrets) {
    const out = redactSecrets(`value ${secret} end`);
    assert.ok(!out.includes(secret), secret);
    assert.ok(out.includes(REDACTED), secret);
  }
});

void test("redacts bearer tokens, URL passwords, assignments and PEM keys", () => {
  const out = redactSecrets(
    [
      "Authorization: Bearer abcdef1234567890xyz",
      "postgres://admin:hunter2pass@db.example.com/app",
      "password=hunter2pass",
      '"api_key": "abcd1234efgh"',
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----",
    ].join("\n"),
  );
  for (const leak of [
    "abcdef1234567890xyz",
    "hunter2pass",
    "abcd1234efgh",
    "MIIEow",
  ]) {
    assert.ok(!out.includes(leak), leak);
  }
  assert.match(out, /Bearer \[REDACTED\]/u);
  assert.match(out, /admin:\[REDACTED\]@db\.example\.com/u);
});

void test("keeps ordinary text", () => {
  const text = "Run pnpm test before you push.";
  assert.equal(redactSecrets(text), text);
});
