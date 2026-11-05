// Boundary parsers for the JSON the hook reads (transcript lines, hook
// payload, state file, Claude Code settings). The hook runs with plain Node
// and no packages, so these do the job of zod schemas: `parse` returns a
// checked shape or throws.

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Any JSON object. */
export const objectSchema = {
  /**
   * @param {unknown} value
   * @returns {Record<string, unknown>}
   */
  parse(value) {
    if (!isPlainObject(value)) throw new Error("expected a JSON object");
    return value;
  },
  /**
   * @param {unknown} value
   * @returns {value is Record<string, unknown>}
   */
  is: isPlainObject,
};

/** Claude Code hook payload; a missing field is "". */
export const hookPayloadSchema = {
  /**
   * @param {unknown} value
   * @returns {{ sessionId: string; transcriptPath: string; cwd: string }}
   */
  parse(value) {
    const input = objectSchema.parse(value);
    const text = (/** @type {unknown} */ field) =>
      typeof field === "string" ? field : "";
    return {
      sessionId: text(input.session_id),
      transcriptPath: text(input.transcript_path),
      cwd: text(input.cwd),
    };
  },
};

/** State file `{ sessionIds: string[] }`; other entries are dropped. */
export const submittedStateSchema = {
  /**
   * @param {unknown} value
   * @returns {string[]}
   */
  parse(value) {
    const ids = objectSchema.parse(value).sessionIds;
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  },
};
