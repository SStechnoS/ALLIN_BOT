"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.zoomService = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const logger_1 = require("../logger");
class ZoomService {
    tokenCache = null;
    async getToken() {
        if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
            return this.tokenCache.token;
        }
        const credentials = Buffer.from(`${config_1.config.ZOOM_CLIENT_ID}:${config_1.config.ZOOM_CLIENT_SECRET}`).toString('base64');
        const res = await axios_1.default.post('https://zoom.us/oauth/token', null, {
            params: { grant_type: 'account_credentials', account_id: config_1.config.ZOOM_ACCOUNT_ID },
            headers: { Authorization: `Basic ${credentials}` },
        });
        // Токен живёт 1 час, кэшируем на 55 минут
        this.tokenCache = {
            token: res.data.access_token,
            expiresAt: Date.now() + 55 * 60 * 1000,
        };
        return this.tokenCache.token;
    }
    async createMeeting(topic, startTime) {
        const token = await this.getToken();
        const res = await axios_1.default.post('https://api.zoom.us/v2/users/me/meetings', {
            topic,
            type: 2, // scheduled
            start_time: startTime,
            duration: 60,
            timezone: 'Europe/Tallinn',
            settings: {
                waiting_room: false,
                join_before_host: true,
                mute_upon_entry: false,
            },
        }, { headers: { Authorization: `Bearer ${token}` } });
        logger_1.logger.info({ meetingId: res.data.id, topic }, 'Zoom meeting created');
        return res.data;
    }
    async deleteMeeting(meetingId) {
        if (!meetingId)
            return;
        const token = await this.getToken();
        try {
            await axios_1.default.delete(`https://api.zoom.us/v2/meetings/${meetingId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            logger_1.logger.info({ meetingId }, 'Zoom meeting deleted');
        }
        catch (err) {
            if (err.response?.status === 404) {
                logger_1.logger.warn({ meetingId }, 'Zoom meeting not found (already deleted)');
            }
            else {
                throw err;
            }
        }
    }
}
exports.zoomService = new ZoomService();
//# sourceMappingURL=zoom.service.js.map