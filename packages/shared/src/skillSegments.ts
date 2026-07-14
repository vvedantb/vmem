export type InputSkillSegment =
  | { kind: "text"; text: string }
  | { kind: "skill"; name: string; text: string };

// split input into plain text and completed `/skill` tokens (known name + space/end)
export function segmentInputBySkills(
  input: string,
  skillNames: ReadonlySet<string>,
): InputSkillSegment[] {
  const namesByLength = [...skillNames].sort(
    (left, right) => right.length - left.length,
  );
  const segments: InputSkillSegment[] = [];
  let buffer = "";
  let index = 0;

  const flushText = () => {
    if (buffer.length > 0) {
      segments.push({ kind: "text", text: buffer });
      buffer = "";
    }
  };

  while (index < input.length) {
    if (input[index] === "/") {
      let matched: { name: string; text: string } | null = null;
      for (const name of namesByLength) {
        const text = `/${name}`;
        if (input.startsWith(text, index)) {
          const end = index + text.length;
          const next = input[end];
          if (end === input.length || next === " " || next === "\n") {
            matched = { name, text };
            break;
          }
        }
      }
      if (matched) {
        flushText();
        segments.push({
          kind: "skill",
          name: matched.name,
          text: matched.text,
        });
        index += matched.text.length;
        continue;
      }
    }
    buffer += input[index];
    index += 1;
  }

  flushText();
  return segments;
}
