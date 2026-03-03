"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const config_1 = require("./config");
function log(level, msg, meta) {
    if (level === "debug" && !config_1.config.isDev)
        return;
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase()}]`;
    const line = meta !== undefined
        ? `${prefix} ${msg} ${JSON.stringify(meta)}`
        : `${prefix} ${msg}`;
    if (level === "error") {
        console.error(line);
    }
    else {
        console.log(line);
    }
}
exports.logger = {
    info: (msg, meta) => log("info", msg, meta),
    warn: (msg, meta) => log("warn", msg, meta),
    error: (msg, meta) => log("error", msg, meta),
    debug: (msg, meta) => log("debug", msg, meta),
};
//# sourceMappingURL=logger.js.map