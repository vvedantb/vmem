// limits for user settings, shared by the settings UIs and the backend
// userSettings.update check (the web, the extension and MCP settings_update)
export const SETTINGS_TEXT_MAX_LENGTH = 500; // aboutMe, preferences
export const CONFIDENCE_THRESHOLD_MIN = 0;
export const CONFIDENCE_THRESHOLD_MAX = 100;
export const MIN_SYNC_INTERVAL_MINUTES = 15;
export const MAX_SYNC_INTERVAL_MINUTES = 1440; // one day
// typed confirmation for Delete all memories (web dialog + MCP memory_delete_all)
export const DELETE_ALL_MEMORIES_PHRASE = "delete all memories";
