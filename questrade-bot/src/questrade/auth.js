import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import { logger } from "../engine/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, "../../data/questrade_tokens.json");

/**
 * Manages the Questrade OAuth2 token lifecycle.
 *
 * Questrade refresh tokens are SINGLE USE: every refresh returns a new
 * refresh token that must replace the old one. Access tokens expire
 * after ~30 minutes. Tokens are persisted to disk so the bot can
 * restart without requiring a brand-new refresh token from the user
 * every time.
 */
export class QuestradeAuth {
  constructor() {
    this.tokens = null; // { access_token, api_server, refresh_token, expires_at }
  }

  loadFromDisk() {
    try {
      const raw = fs.readFileSync(TOKEN_FILE, "utf-8");
      this.tokens = JSON.parse(raw);
    } catch {
      this.tokens = null;
    }
  }

  saveToDisk() {
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(this.tokens, null, 2));
  }

  async getAccessToken() {
    if (!this.tokens) this.loadFromDisk();

    const needsRefresh =
      !this.tokens || Date.now() >= this.tokens.expires_at - 60_000; // refresh 1 min early

    if (needsRefresh) {
      const refreshToken = this.tokens?.refresh_token || config.questrade.refreshToken;
      if (!refreshToken) {
        throw new Error(
          "No Questrade refresh token available. Set QUESTRADE_REFRESH_TOKEN in .env."
        );
      }
      await this.refresh(refreshToken);
    }

    return { accessToken: this.tokens.access_token, apiServer: this.tokens.api_server };
  }

  async refresh(refreshToken) {
    const url = `${config.questrade.authUrl}?grant_type=refresh_token&refresh_token=${encodeURIComponent(
      refreshToken
    )}`;

    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Questrade auth refresh failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    this.tokens = {
      access_token: data.access_token,
      api_server: data.api_server, // includes trailing slash
      refresh_token: data.refresh_token, // new single-use token
      expires_at: Date.now() + data.expires_in * 1000,
    };
    this.saveToDisk();
    logger.info("auth", "Questrade access token refreshed");
  }
}
