import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  defaultSettings,
  settingsPatchSchema,
  settingsSchema,
  type Settings,
} from "./settings-schema";

/** Persists settings as JSON in the Electron userData directory. */
export class SettingsStore {
  private readonly file: string;
  private current: Settings;

  constructor(dir: string) {
    this.file = join(dir, "settings.json");
    this.current = this.load();
  }

  get(): Settings {
    return this.current;
  }

  /** Validates `patch`, merges it into the current settings and saves. */
  update(patch: unknown): Settings {
    const parsed = settingsPatchSchema.parse(patch);
    this.current = settingsSchema.parse({ ...this.current, ...parsed });
    mkdirSync(dirname(this.file), { recursive: true });
    // The file holds the API key, so keep it owner-only.
    writeFileSync(this.file, JSON.stringify(this.current, null, 2), {
      mode: 0o600,
    });
    chmodSync(this.file, 0o600);
    return this.current;
  }

  private load(): Settings {
    try {
      return settingsSchema.parse(JSON.parse(readFileSync(this.file, "utf8")));
    } catch {
      return defaultSettings();
    }
  }
}
