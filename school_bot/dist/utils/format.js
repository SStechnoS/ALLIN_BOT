"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDay = formatDay;
exports.formatTime = formatTime;
exports.formatMonthLabel = formatMonthLabel;
exports.ymToBounds = ymToBounds;
exports.currentYM = currentYM;
exports.prevYM = prevYM;
exports.nextYM = nextYM;
const config_1 = require("../config");
function formatDay(date) {
    return new Intl.DateTimeFormat('ru-RU', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        timeZone: config_1.config.timezone,
    }).format(date);
}
function formatTime(date) {
    return new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: config_1.config.timezone,
    }).format(date);
}
// ── Month helpers ─────────────────────────────────────────────────────────────
// ym format: "YYYY-MM" (ISO month, also used in callback data)
function formatMonthLabel(ym) {
    const [yearS, monthS] = ym.split('-');
    const d = new Date(Number(yearS), Number(monthS) - 1, 1);
    const s = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function ymToBounds(ym) {
    const [yearS, monthS] = ym.split('-');
    const year = Number(yearS);
    const month = Number(monthS);
    const since = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
    const until = Math.floor(new Date(year, month, 1).getTime() / 1000) - 1;
    return { since, until };
}
function currentYM() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function prevYM(ym) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextYM(ym) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
//# sourceMappingURL=format.js.map