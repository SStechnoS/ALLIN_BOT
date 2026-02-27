import { config } from '../config';

export function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: config.timezone,
  }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: config.timezone,
  }).format(date);
}

// ── Month helpers ─────────────────────────────────────────────────────────────
// ym format: "YYYY-MM" (ISO month, also used in callback data)

export function formatMonthLabel(ym: string): string {
  const [yearS, monthS] = ym.split('-');
  const d = new Date(Number(yearS), Number(monthS) - 1, 1);
  const s = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ymToBounds(ym: string): { since: number; until: number } {
  const [yearS, monthS] = ym.split('-');
  const year = Number(yearS);
  const month = Number(monthS);
  const since = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
  const until = Math.floor(new Date(year, month, 1).getTime() / 1000) - 1;
  return { since, until };
}

export function currentYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function prevYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y!, m! - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nextYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y!, m!, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
