import { config } from '../config';

interface ZoomTokenCache {
  accessToken: string;
  expiresAt: number; // unix ms
}

let tokenCache: ZoomTokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 30_000) {
    return tokenCache.accessToken;
  }

  const credentials = Buffer.from(
    `${config.zoom.clientId}:${config.zoom.clientSecret}`,
  ).toString('base64');

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(config.zoom.accountId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zoom OAuth failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return tokenCache.accessToken;
}

export interface CreateMeetingOptions {
  topic: string;
  /** ISO 8601 string in UTC, e.g. "2025-03-10T14:00:00Z" */
  startTime: string;
  durationMinutes: number;
}

/**
 * Creates a Zoom meeting and returns the join URL.
 */
export async function createMeeting(opts: CreateMeetingOptions): Promise<string> {
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

  const data = (await res.json()) as { join_url: string };
  return data.join_url;
}
