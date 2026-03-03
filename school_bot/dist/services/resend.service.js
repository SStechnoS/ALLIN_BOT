"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const resend_1 = require("resend");
const config_1 = require("../config");
let _client = null;
function getClient() {
    if (!_client) {
        _client = new resend_1.Resend(config_1.config.resend.apiKey);
    }
    return _client;
}
async function sendEmail({ to, subject, html, }) {
    const { error } = await getClient().emails.send({
        from: config_1.config.resend.from,
        to,
        subject,
        html,
    });
    if (error) {
        throw new Error(`Resend error: ${error.message}`);
    }
}
//# sourceMappingURL=resend.service.js.map