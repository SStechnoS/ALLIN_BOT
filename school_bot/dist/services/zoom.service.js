"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMeeting = createMeeting;
const config_1 = require("../config");
let tokenCache = null;
async function getAccessToken() {
    const now = Date.now();
    if (tokenCache && tokenCache.expiresAt > now + 30_000) {
        return tokenCache.accessToken;
    }
    const credentials = Buffer.from(`${config_1.config.zoom.clientId}:${config_1.config.zoom.clientSecret}`).toString('base64');
    const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(config_1.config.zoom.accountId)}`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Zoom OAuth failed: ${res.status} ${body}`);
    }
    const data = (await res.json());
    tokenCache = {
        accessToken: data.access_token,
        expiresAt: now + data.expires_in * 1000,
    };
    return tokenCache.accessToken;
}
/**
 * Creates a Zoom meeting and returns the join URL and meeting ID.
 */
async function createMeeting(opts) {
    const token = await getAccessToken();
    const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            topic: opts.topic,
            type: 2, // scheduled meeting
            start_time: opts.startTime,
            duration: opts.durationMinutes,
            settings: {
                join_before_host: true,
                waiting_room: false,
            },
        }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Zoom create meeting failed: ${res.status} ${body}`);
    }
    const data = (await res.json());
    return { joinUrl: data.join_url, meetingId: String(data.id) };
}
//# sourceMappingURL=zoom.service.js.map