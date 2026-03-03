"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.initDb = initDb;
exports.closeDb = closeDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const config_1 = require("../config");
const logger_1 = require("../logger");
const migrations_1 = require("./migrations");
let _db = null;
function getDb() {
    if (!_db)
        throw new Error('DB not initialised. Call initDb() first.');
    return _db;
}
function initDb() {
    _db = new better_sqlite3_1.default(config_1.config.db.path);
    // WAL mode: better concurrency + crash safety for SQLite
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    (0, migrations_1.runMigrations)(_db);
    logger_1.logger.info('Database ready', { path: config_1.config.db.path });
    return _db;
}
function closeDb() {
    _db?.close();
    _db = null;
}
//# sourceMappingURL=client.js.map