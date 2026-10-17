import {
  mcpOAuthStateSchema,
  type McpOAuthState,
  type McpOAuthStorage,
} from "./mcp-oauth";
import type { SettingsStore } from "./settings";

/** The part of Electron `safeStorage` that this module needs. */
export interface SecretCrypto {
  available: () => boolean;
  encrypt: (plain: string) => string;
  decrypt: (cipher: string) => string;
}

/**
 * OAuth client information and tokens. On disk they are safeStorage
 * ciphertext in settings.json. Without encryption they stay in memory for this
 * session: plain tokens never reach the disk.
 */
export class OAuthStateStorage implements McpOAuthStorage {
  private memory: McpOAuthState | undefined;

  constructor(
    private readonly settings: SettingsStore,
    private readonly crypto: SecretCrypto,
  ) {
    this.memory = this.read();
  }

  load(): McpOAuthState | undefined {
    return this.memory;
  }

  save(state: McpOAuthState | undefined): void {
    this.memory = state;
    if (state === undefined) {
      if (this.settings.get().oauthCipher !== "") {
        this.settings.update({ oauthCipher: "" });
      }
      return;
    }
    if (!this.crypto.available()) return;
    this.settings.update({
      oauthCipher: this.crypto.encrypt(JSON.stringify(state)),
    });
  }

  private read(): McpOAuthState | undefined {
    const cipher = this.settings.get().oauthCipher;
    if (cipher === "" || !this.crypto.available()) return undefined;
    try {
      return mcpOAuthStateSchema.parse(JSON.parse(this.crypto.decrypt(cipher)));
    } catch {
      return undefined;
    }
  }
}
