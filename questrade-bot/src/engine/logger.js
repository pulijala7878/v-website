import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, "../../data");
const LOG_FILE = path.join(LOG_DIR, "bot.log");
const TRADE_LOG_FILE = path.join(LOG_DIR, "trades.jsonl");

function ensureDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function write(line) {
  ensureDir();
  fs.appendFileSync(LOG_FILE, line + "\n");
}

function format(level, scope, msg, extra) {
  const ts = new Date().toISOString();
  const extraStr = extra !== undefined ? " " + JSON.stringify(extra) : "";
  return `[${ts}] [${level.toUpperCase()}] [${scope}] ${msg}${extraStr}`;
}

export const logger = {
  info(scope, msg, extra) {
    const line = format("info", scope, msg, extra);
    console.log(line);
    write(line);
  },
  warn(scope, msg, extra) {
    const line = format("warn", scope, msg, extra);
    console.warn(line);
    write(line);
  },
  error(scope, msg, extra) {
    const line = format("error", scope, msg, extra);
    console.error(line);
    write(line);
  },
  /** Append a structured record to the trade journal (JSON Lines). */
  trade(record) {
    ensureDir();
    const entry = { timestamp: new Date().toISOString(), ...record };
    fs.appendFileSync(TRADE_LOG_FILE, JSON.stringify(entry) + "\n");
    this.info("trade", `${record.action} ${record.symbol}`, record);
  },
};
