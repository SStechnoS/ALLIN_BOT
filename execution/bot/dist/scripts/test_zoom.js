"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Тест Zoom API интеграции
 * Запуск: npm run test:zoom
 */
require("dotenv/config");
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
async function getToken() {
    const credentials = Buffer.from(`${config_1.config.ZOOM_CLIENT_ID}:${config_1.config.ZOOM_CLIENT_SECRET}`).toString('base64');
    const res = await axios_1.default.post('https://zoom.us/oauth/token', null, {
        params: { grant_type: 'account_credentials', account_id: config_1.config.ZOOM_ACCOUNT_ID },
        headers: { Authorization: `Basic ${credentials}` }
    });
    return res.data.access_token;
}
async function testZoom() {
    console.log('Testing Zoom API...\n');
    // 1. Получить токен
    console.log('1. Getting access token...');
    const token = await getToken();
    console.log(`✅ Token: ${token.substring(0, 20)}...\n`);
    // 2. Создать тестовую встречу
    console.log('2. Creating test meeting...');
    const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const meetingRes = await axios_1.default.post('https://api.zoom.us/v2/users/me/meetings', {
        topic: '[TEST] All In Academy — Пробный урок',
        type: 2,
        start_time: startTime,
        duration: 60,
        timezone: 'Europe/Tallinn',
        settings: { waiting_room: false }
    }, { headers: { Authorization: `Bearer ${token}` } });
    const meeting = meetingRes.data;
    console.log(`✅ Meeting created:`);
    console.log(`   ID: ${meeting.id}`);
    console.log(`   Join URL: ${meeting.join_url}\n`);
    // 3. Удалить тестовую встречу
    console.log('3. Deleting test meeting...');
    await axios_1.default.delete(`https://api.zoom.us/v2/meetings/${meeting.id}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Meeting deleted\n');
    console.log('🎉 Zoom integration OK!');
}
testZoom().catch((err) => {
    console.error('❌ Zoom test failed:', err.response?.data || err.message);
    process.exit(1);
});
//# sourceMappingURL=test_zoom.js.map