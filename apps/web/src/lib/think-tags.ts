export function parseThinkTags(raw: string): {
  reasoning: string;
  text: string;
  isThinking: boolean;
} {
  let reasoning = "";
  let text = "";
  let isThinking = false;
  let cursor = 0;

  while (cursor < raw.length) {
    if (!isThinking) {
      const thinkStart = raw.indexOf("<think>", cursor);
      if (thinkStart === -1) {
        text += raw.slice(cursor);
        break;
      }
      text += raw.slice(cursor, thinkStart);
      cursor = thinkStart + "<redacted_thinking>".length;
      isThinking = true;
    } else {
      const thinkEnd = raw.indexOf("</redacted_thinking>", cursor);
      if (thinkEnd === -1) {
        reasoning += raw.slice(cursor);
        break;
      }
      reasoning += raw.slice(cursor, thinkEnd);
      cursor = thinkEnd + "</redacted_thinking>".length;
      isThinking = false;
    }
  }

  return { reasoning: reasoning.trim(), text: text.trim(), isThinking };
}
