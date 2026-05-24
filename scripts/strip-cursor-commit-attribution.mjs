/**
 * Remove Cursor agent co-author trailers from git commit messages.
 * Used by .husky/commit-msg — Cursor may inject these even when attribution is off.
 */
import fs from "node:fs";

const commitMsgPath = process.argv[2];
if (!commitMsgPath) {
  process.exit(0);
}

const cursorCoAuthor =
  /^Co-authored-by:\s*Cursor\s*<cursoragent@cursor\.com>\s*$/i;

const lines = fs.readFileSync(commitMsgPath, "utf8").split("\n");
const filtered = lines.filter((line) => !cursorCoAuthor.test(line));

while (filtered.length > 0 && filtered[filtered.length - 1] === "") {
  filtered.pop();
}

const output = filtered.length === 0 ? "" : `${filtered.join("\n")}\n`;
fs.writeFileSync(commitMsgPath, output);
