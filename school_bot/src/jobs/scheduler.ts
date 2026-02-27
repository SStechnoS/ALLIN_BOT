import { Markup, type Telegraf } from "telegraf";
import type { BotContext } from "../types";
import { getDueJobs, markJobSent, type JobRow } from "./db";
import { getUserByTelegramId, getUserBooking } from "../services/user.service";
import { notifyAdmins } from "../admin/notifications";
import { config } from "../config";
import { logger } from "../logger";

// ── Night guard ───────────────────────────────────────────────────────────────

function isNightNow(): boolean {
  const hour =
    parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: config.timezone,
        hour: "numeric",
        hour12: false,
      }).format(new Date()),
      10,
    ) % 24;
  return hour >= 24 || hour < 7;
}

// ── Lesson reminder payload type ──────────────────────────────────────────────

interface LessonPayload {
  eventStart: number;
  calendarEventId: string;
  dayLabel: string;
  timeLabel: string;
  zoomLink: string;
}

// ── Job handler ───────────────────────────────────────────────────────────────

async function handleJob(
  bot: Telegraf<BotContext>,
  job: JobRow,
): Promise<void> {
  const payload = JSON.parse(job.payload) as Record<string, unknown>;

  // ── Nudge ─────────────────────────────────────────────────────────────────
  if (job.type === "nudge") {
    const user = getUserByTelegramId(job.tg_id);
    if (!user) return;

    const booking = getUserBooking(user.id);
    if (booking) return; // user already booked, skip

    const attempt =
      typeof payload["attempt"] === "number" ? payload["attempt"] : 1;

    let text: string;
    if (!user.name) {
      const variants = [
        "👋 Вы начали регистрацию, но не завершили её. Нажмите /start — это займёт всего минуту!",
        "🔔 Напоминаем: ваша регистрация не завершена. Нажмите /start чтобы записаться на пробный урок.",
        "⏰ Последнее напоминание! Завершите регистрацию — нажмите /start.",
      ];
      text = variants[(attempt - 1) % variants.length]!;
    } else {
      const variants = [
        "👋 Вы зарегистрированы! Нажмите /start чтобы выбрать время для пробного урока.",
        "🔔 Напоминаем: у вас ещё нет записи на урок. Нажмите /start чтобы выбрать время.",
        "⏰ Свободные слоты могут закончиться — нажмите /start чтобы записаться!",
      ];
      text = variants[(attempt - 1) % variants.length]!;
    }

    await bot.telegram.sendMessage(job.tg_id, text);
    return;
  }

  // ── Lesson reminders ──────────────────────────────────────────────────────
  const lp = payload as unknown as LessonPayload;
  const now = Math.floor(Date.now() / 1000);

  // Staleness guards: if we're too close to the event, this reminder is no longer useful
  if (job.type === "remind_24h" && lp.eventStart - now < 3 * 3600) return;
  if (job.type === "remind_5h" && lp.eventStart - now < 30 * 60) return;
  if (job.type === "remind_30min" && lp.eventStart < now) return;

  const user = getUserByTelegramId(job.tg_id);
  if (!user) return;

  const booking = getUserBooking(user.id);
  // Skip if booking was rescheduled (different event) or deleted
  if (!booking || booking.event_start !== lp.eventStart) return;

  const zoomLine = lp.zoomLink ? `\n\n<b>Ссылка Zoom:</b> ${lp.zoomLink}` : "";

  if (job.type === "remind_24h") {
    await bot.telegram.sendMessage(
      job.tg_id,
      `🔔 <b>Напоминание!</b> Завтра у вас пробный урок.\n\n` +
        `<b>День:</b> ${lp.dayLabel}\n` +
        `<b>Время:</b> ${lp.timeLabel}` +
        zoomLine +
        `\n\nПожалуйста, подтвердите своё участие:`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ Подтверждаю",
              `confirm_lesson_${lp.calendarEventId}`,
            ),
          ],
        ]),
      },
    );
    return;
  }

  if (job.type === "remind_5h") {
    if (booking.lesson_confirmed_at) return; // confirmed at 24h step, skip
    await bot.telegram.sendMessage(
      job.tg_id,
      `⏰ <b>Через 5 часов</b> у вас пробный урок!\n\n` +
        `<b>День:</b> ${lp.dayLabel}\n` +
        `<b>Время:</b> ${lp.timeLabel}` +
        zoomLine,
      { parse_mode: "HTML" },
    );
    return;
  }

  if (job.type === "remind_30min") {
    await bot.telegram.sendMessage(
      job.tg_id,
      `🚀 <b>Урок начнётся через 30 минут!</b>\n\n` +
        `<b>День:</b> ${lp.dayLabel}\n` +
        `<b>Время:</b> ${lp.timeLabel}` +
        zoomLine +
        `\n\nДо встречи! 👋`,
      { parse_mode: "HTML" },
    );
    return;
  }

  // ── Admin alert: client didn't confirm 4h before lesson ───────────────────
  if (job.type === "admin_alert_4h") {
    if (lp.eventStart < now) return; // lesson already started/passed
    if (booking.lesson_confirmed_at) return; // confirmed — no alert needed

    const tg = user.telegram_name
      ? `@${user.telegram_name}`
      : `<a href="tg://user?id=${user.telegram_id}">${user.name ?? user.telegram_id}</a>`;

    await notifyAdmins(
      `⚠️ <b>Клиент не подтвердил урок!</b>\n\n` +
        `<b>Имя:</b> ${user.name ?? "—"}\n` +
        `<b>Телефон:</b> ${user.phone ?? "—"}\n` +
        `<b>Email:</b> ${user.email ?? "—"}\n` +
        `<b>Telegram:</b> ${tg}\n\n` +
        `<b>День:</b> ${lp.dayLabel}\n` +
        `<b>Время:</b> ${lp.timeLabel}\n` +
        `До начала урока ~4 часа.`,
    );
    return;
  }
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function processJobs(bot: Telegraf<BotContext>): Promise<void> {
  if (isNightNow()) return; // respect night blackout

  const jobs = getDueJobs();
  for (const job of jobs) {
    try {
      await handleJob(bot, job);
    } catch (err) {
      logger.error("Notification job failed", {
        err,
        jobId: job.id,
        type: job.type,
      });
    } finally {
      markJobSent(job.id); // always mark done to avoid infinite retries
    }
  }
}

export function startScheduler(bot: Telegraf<BotContext>): void {
  // Process any pending jobs from before the last restart
  void processJobs(bot);
  // Then poll every 60 seconds
  setInterval(() => void processJobs(bot), 60 * 1000);
}
