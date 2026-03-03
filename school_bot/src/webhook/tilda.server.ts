import http from 'http';
import { URLSearchParams } from 'url';
import { config } from '../config';
import { sendEmail } from '../services/resend.service';
import { notifyAdmins } from '../admin/notifications';
import { logger } from '../logger';

// Fields Tilda typically excludes from the "extra data" summary
const KNOWN_FIELDS = new Set(['Name', 'name', 'Email', 'email', 'Phone', 'phone', 'formid', 'formname', 'tranid']);

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

const WEBHOOK_PATH = '/webhook/tilda';

async function handleTildaWebhook(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  logger.info(`→ Tilda server: ${req.method} ${req.url}`);

  const reqUrl = new URL(req.url ?? '/', `http://localhost`);

  if (reqUrl.pathname !== WEBHOOK_PATH) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  if (req.method !== 'POST') {
    logger.warn(`Tilda webhook: unexpected method ${req.method}`);
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const body = await readBody(req);
  logger.info(`Tilda webhook raw body: ${body}`);

  // Tilda connectivity test — respond immediately, no secret needed
  if (body.trim() === 'test=test') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // Verify x-tilda-secret header for real form submissions
  const secret = req.headers['x-tilda-secret'] ?? '';
  if (config.tildaWebhook && secret !== config.tildaWebhook) {
    logger.warn(`Tilda webhook: invalid secret header "${secret}"`);
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Unauthorized');
    return;
  }

  const params = new URLSearchParams(body);

  const data: Record<string, string> = {};
  params.forEach((value, key) => { data[key] = value; });

  const name  = data['Name']  || data['name']  || '';
  const email = data['Email'] || data['email'] || '';
  const phone = data['Phone'] || data['phone'] || '';

  logger.info('Tilda webhook parsed', { name, email, phone, allFields: data });

  // Respond immediately so Tilda doesn't time out
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');

  // Process email + admin notifications in the background
  setImmediate(async () => {
    // ── Email to the lead ──────────────────────────────────────────────────
    if (email) {
      try {
        await sendEmail({
          to: email,
          subject: 'Ваша заявка принята!',
          html: `
            <p>Здравствуйте${name ? `, <b>${name}</b>` : ''}!</p>
            <p>Спасибо за заявку. Мы получили ваши данные и свяжемся с вами в ближайшее время.</p>
            <p>С уважением,<br/>Команда All In Academy</p>
          `,
        });
        logger.info('Welcome email sent', { email });
      } catch (err) {
        logger.error('Failed to send welcome email', { err, email });
      }
    }

    // ── Admin notification ─────────────────────────────────────────────────
    const extra = Object.entries(data)
      .filter(([k]) => !KNOWN_FIELDS.has(k))
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');

    const adminText = [
      '🆕 <b>Новая заявка с сайта</b>',
      name  && `👤 Имя: <b>${name}</b>`,
      email && `📧 Email: <b>${email}</b>`,
      phone && `📞 Телефон: <b>${phone}</b>`,
      extra && `\n📋 Доп. данные:\n${extra}`,
    ].filter(Boolean).join('\n');

    try {
      await notifyAdmins(adminText);
    } catch (err) {
      logger.error('Failed to notify admins about Tilda lead', { err });
    }

    logger.info('Tilda webhook processed successfully');
  });
}

export function startTildaWebhookServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      await handleTildaWebhook(req, res);
    } catch (err) {
      logger.error('Tilda webhook handler error', { err });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    }
  });

  const port = config.webhookPort;
  server.listen(port, () => {
    logger.info(`Tilda webhook server listening on port ${port}`);
    const base = config.publicUrl || `http://localhost:${port}`;
    logger.info(`Webhook URL: ${base}${WEBHOOK_PATH}`);
  });

  return server;
}
