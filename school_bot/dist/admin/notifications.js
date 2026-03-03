"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAdminNotifier = initAdminNotifier;
exports.notifyAdmins = notifyAdmins;
const db_1 = require("./db");
const logger_1 = require("../logger");
let _telegram = null;
function initAdminNotifier(telegram) {
    _telegram = telegram;
}
async function notifyAdmins(text) {
    if (!_telegram)
        return;
    const admins = (0, db_1.getAllAdmins)();
    for (const admin of admins) {
        try {
            await _telegram.sendMessage(admin.telegram_id, text, { parse_mode: 'HTML' });
        }
        catch (err) {
            logger_1.logger.error('Failed to notify admin', { err, adminId: admin.telegram_id });
        }
    }
}
//# sourceMappingURL=notifications.js.map