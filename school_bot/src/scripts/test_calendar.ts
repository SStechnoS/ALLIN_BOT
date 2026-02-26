/**
 * Diagnostic script — run with:
 *   npx tsx src/scripts/test_calendar.ts
 */
import 'dotenv/config';
import { google } from 'googleapis';

void (async () => {
  const SA_JSON = process.env['GOOGLE_SERVICE_ACCOUNT_JSON'];
  const CALENDAR_ID = process.env['GOOGLE_CALENDAR_ID'];

  if (!SA_JSON || !CALENDAR_ID) {
    console.error('Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CALENDAR_ID in .env');
    process.exit(1);
  }

  const raw = JSON.parse(SA_JSON) as {
    private_key?: string;
    client_email?: string;
    private_key_id?: string;
    [k: string]: unknown;
  };

  console.log('\n=== Service Account Info ===');
  console.log('client_email   :', raw.client_email);
  console.log('private_key_id :', raw.private_key_id);

  // Verify PEM boundaries
  const key = raw.private_key ?? '';
  const normalised = key.replace(/\\n/g, '\n');
  console.log('\n=== Private Key ===');
  console.log('Starts with    :', JSON.stringify(normalised.slice(0, 40)));
  console.log('Ends with      :', JSON.stringify(normalised.slice(-40)));
  console.log('Line count     :', normalised.split('\n').length);
  raw.private_key = normalised;

  console.log('\n=== Authenticating... ===');
  const auth = new google.auth.GoogleAuth({
    credentials: raw,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    console.log('✅ Auth OK — got access token:', (token.token ?? '').slice(0, 20) + '...');
  } catch (err: unknown) {
    const e = err as { message?: string; response?: { data?: unknown } };
    console.error('❌ Auth FAILED:', e.message);
    if (e.response?.data) console.error('   Google response:', JSON.stringify(e.response.data));
    console.error('\nFix options:');
    console.error('  1. console.cloud.google.com → IAM & Admin → Service Accounts');
    console.error('     → Find:', raw.client_email);
    console.error('     → KEYS tab — check that key ID', raw.private_key_id, 'is Active.');
    console.error('       If deleted/missing → ADD KEY → Create new key → JSON → update .env');
    console.error('  2. console.cloud.google.com → APIs & Services → Library');
    console.error('     → search "Google Calendar API" → make sure it is Enabled');
    process.exit(1);
  }

  console.log('\n=== Fetching calendar events... ===');
  const calendar = google.calendar({ version: 'v3', auth });
  try {
    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      maxResults: 5,
      singleEvents: true,
      orderBy: 'startTime',
      timeMin: new Date().toISOString(),
    });
    const items = res.data.items ?? [];
    console.log(`✅ Calendar OK — found ${items.length} upcoming events`);
    items.forEach((e) => console.log('  -', e.summary, '|', e.start?.dateTime ?? e.start?.date));
  } catch (err: unknown) {
    const e = err as { message?: string; response?: { data?: unknown } };
    console.error('❌ Calendar access FAILED:', e.message);
    if (e.response?.data) console.error('   Google response:', JSON.stringify(e.response.data));
    console.error('\nFix: share the calendar with the service account email:');
    console.error('  ', raw.client_email);
    console.error('  Google Calendar → Settings → Share with specific people → add email above → "Make changes to events"');
    process.exit(1);
  }
})();
