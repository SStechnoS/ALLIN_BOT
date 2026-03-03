"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTildaWebhookServer = startTildaWebhookServer;
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
const config_1 = require("../config");
const resend_service_1 = require("../services/resend.service");
const notifications_1 = require("../admin/notifications");
const logger_1 = require("../logger");
// Fields Tilda typically excludes from the "extra data" summary
const KNOWN_FIELDS = new Set(['Name', 'name', 'Email', 'email', 'Phone', 'phone', 'formid', 'formname', 'tranid']);
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
    });
}
const WEBHOOK_PATH = '/webhook/tilda';
async function handleTildaWebhook(req, res) {
    logger_1.logger.info(`→ Tilda server: ${req.method} ${req.url}`);
    const reqUrl = new URL(req.url ?? '/', `http://localhost`);
    if (reqUrl.pathname !== WEBHOOK_PATH) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
    }
    if (req.method !== 'POST') {
        logger_1.logger.warn(`Tilda webhook: unexpected method ${req.method}`);
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
        return;
    }
    // Verify x-tilda-secret header
    const secret = req.headers['x-tilda-secret'] ?? '';
    if (config_1.config.tildaWebhook && secret !== config_1.config.tildaWebhook) {
        logger_1.logger.warn(`Tilda webhook: invalid secret header "${secret}"`);
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
        return;
    }
    const body = await readBody(req);
    logger_1.logger.info(`Tilda webhook raw body: ${body}`);
    const params = new url_1.URLSearchParams(body);
    const data = {};
    params.forEach((value, key) => { data[key] = value; });
    const name = data['Name'] || data['name'] || '';
    const email = data['Email'] || data['email'] || '';
    const phone = data['Phone'] || data['phone'] || '';
    logger_1.logger.info('Tilda webhook parsed', { name, email, phone, allFields: data });
    // Respond immediately so Tilda doesn't time out
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    // Process email + admin notifications in the background
    setImmediate(async () => {
        // ── Email to the lead ──────────────────────────────────────────────────
        if (email) {
            try {
                await (0, resend_service_1.sendEmail)({
                    to: email,
                    subject: 'Ваша заявка принята!',
                    html: `
            <p>Здравствуйте${name ? `, <b>${name}</b>` : ''}!</p>
            <p>Спасибо за заявку. Мы получили ваши данные и свяжемся с вами в ближайшее время.</p>
            <p>С уважением,<br/>Команда All In Academy</p>
          `,
                });
                logger_1.logger.info('Welcome email sent', { email });
            }
            catch (err) {
                logger_1.logger.error('Failed to send welcome email', { err, email });
            }
        }
        // ── Admin notification ─────────────────────────────────────────────────
        const extra = Object.entries(data)
            .filter(([k]) => !KNOWN_FIELDS.has(k))
            .map(([k, v]) => `  ${k}: ${v}`)
            .join('\n');
        const adminText = [
            '🆕 <b>Новая заявка с сайта</b>',
            name && `👤 Имя: <b>${name}</b>`,
            email && `📧 Email: <b>${email}</b>`,
            phone && `📞 Телефон: <b>${phone}</b>`,
            extra && `\n📋 Доп. данные:\n${extra}`,
        ].filter(Boolean).join('\n');
        try {
            await (0, notifications_1.notifyAdmins)(adminText);
        }
        catch (err) {
            logger_1.logger.error('Failed to notify admins about Tilda lead', { err });
        }
        logger_1.logger.info('Tilda webhook processed successfully');
    });
}
function startTildaWebhookServer() {
    const server = http_1.default.createServer(async (req, res) => {
        try {
            await handleTildaWebhook(req, res);
        }
        catch (err) {
            logger_1.logger.error('Tilda webhook handler error', { err });
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
        }
    });
    const port = config_1.config.webhookPort;
    server.listen(port, () => {
        logger_1.logger.info(`Tilda webhook server listening on port ${port}`);
        const base = config_1.config.publicUrl || `http://localhost:${port}`;
        logger_1.logger.info(`Webhook URL: ${base}${WEBHOOK_PATH}`);
    });
    return server;
}
//# sourceMappingURL=tilda.server.js.map