/**
 * Strip thinking blocks and markdown fences from raw LLM output before JSON.parse.
 */
export function extractJsonString(raw: string): string {
  let jsonStr = raw.trim();

  jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  if (jsonStr.startsWith("<think>")) {
    const closeIdx = jsonStr.indexOf("</think>");
    if (closeIdx === -1) {
      jsonStr = jsonStr.slice(7).trim();
    }
  }

  if (jsonStr.startsWith("```")) {
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match?.[1]) {
      jsonStr = match[1].trim();
    }
  }

  return jsonStr;
}
