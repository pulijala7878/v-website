import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSITIONS_FILE = path.join(__dirname, "../../data/positions.json");

/**
 * Persists the bot's view of open positions and their exit targets
 * (stop loss / take profit / protective stop order id) so that exit
 * management survives restarts and works in both paper and live mode.
 *
 * Keyed by symbol. Shape per entry:
 * {
 *   symbolId, action: "BUY"|"SELL", entryPrice, quantity,
 *   stopLoss, takeProfit, stopOrderId, openedAt
 * }
 */
export class PositionTracker {
  constructor() {
    this.positions = {};
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(POSITIONS_FILE, "utf-8");
      this.positions = JSON.parse(raw);
    } catch {
      this.positions = {};
    }
  }

  save() {
    fs.mkdirSync(path.dirname(POSITIONS_FILE), { recursive: true });
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(this.positions, null, 2));
  }

  add(symbol, record) {
    this.positions[symbol] = record;
    this.save();
  }

  get(symbol) {
    return this.positions[symbol];
  }

  has(symbol) {
    return !!this.positions[symbol];
  }

  remove(symbol) {
    delete this.positions[symbol];
    this.save();
  }

  list() {
    return Object.entries(this.positions).map(([symbol, record]) => ({ symbol, ...record }));
  }

  count() {
    return Object.keys(this.positions).length;
  }
}
