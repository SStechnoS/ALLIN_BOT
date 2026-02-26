import { Scenes, Markup } from 'telegraf';
import type { BotContext } from '../types';
import {
  getAvailableSlots,
  bookSlot,
  type CalendarSlot,
} from '../services/calendar.service';
import { getUserByTelegramId, createBooking } from '../services/user.service';
import { createMeeting } from '../services/zoom.service';
import { cancelNudges, scheduleLessonReminders } from '../jobs/notifications';
import { syncUserRow } from '../services/sheets.service';
import { formatDay, formatTime } from '../utils/format';
import { sendMainMenu } from '../bot/keyboards';
import { logger } from '../logger';

export const SCENE_BOOKING = 'booking';

/** Scene-local state stored in ctx.scene.state (persisted under __scenes in SQLite). */
interface BookingState {
  dayKey?: string;
  dayLabel?: string;
  slots?: Record<string, string>; // index → Google Calendar eventId
  eventId?: string;
  timeLabel?: string;
  eventStart?: number;
  eventEnd?: number;
}

function s(ctx: BotContext): BookingState {
  return ctx.scene.state as BookingState;
}

function clearState(ctx: BotContext): void {
  ctx.scene.state = {} satisfies BookingState;
}

// ────────────────────────────────────────────────────────────────────────────

export const bookingScene = new Scenes.BaseScene<BotContext>(SCENE_BOOKING);

// ── Enter ──────────────────────────────────────────────────────────────────

bookingScene.enter(async (ctx) => {
  clearState(ctx);
  await showDaySelection(ctx);
});

// ── Day selected ───────────────────────────────────────────────────────────

bookingScene.action(/^booking_day_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const dayKey = ctx.match?.[1];
  if (!dayKey) return;

  let slots: Map<string, CalendarSlot[]>;
  try {
    slots = await getAvailableSlots();
  } catch (err) {
    logger.error('Calendar fetch failed', { err });
    await ctx.answerCbQuery('Ошибка загрузки расписания. Попробуйте позже.');
    return;
  }

  const daySlots = slots.get(dayKey);
  if (!daySlots || daySlots.length === 0) {
    await showDaySelection(ctx);
    return;
  }

  const slotMap: Record<string, string> = {};
  const timeButtons = daySlots.map((slot, i) => {
    slotMap[String(i)] = slot.eventId;
    return [Markup.button.callback(slot.timeLabel, `booking_time_${i}`)];
  });

  ctx.scene.state = {
    ...s(ctx),
    dayKey,
    dayLabel: daySlots[0]!.dayLabel,
    slots: slotMap,
  };

  await ctx.editMessageText(
    `Выберите удобное время:\n<b>${daySlots[0]!.dayLabel}</b>`,
    {
      ...Markup.inlineKeyboard([
        ...timeButtons,
        [Markup.button.callback('← Назад', 'booking_back_days')],
      ]),
      parse_mode: 'HTML',
    },
  );
});

// ── Time selected ──────────────────────────────────────────────────────────

bookingScene.action(/^booking_time_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const idx = ctx.match?.[1];
  if (idx === undefined) return;

  const state = s(ctx);
  const eventId = state.slots?.[idx];
  if (!eventId) {
    await ctx.answerCbQuery('Слот недоступен, выберите другое время.');
    return;
  }

  let slots: Map<string, CalendarSlot[]>;
  try {
    slots = await getAvailableSlots();
  } catch (err) {
    logger.error('Calendar fetch failed', { err });
    return;
  }

  const dayKey = state.dayKey;
  if (!dayKey) return;

  const slot = slots.get(dayKey)?.find((s) => s.eventId === eventId);
  if (!slot) {
    await showTimeSelection(ctx, dayKey, slots);
    return;
  }

  ctx.scene.state = {
    ...state,
    eventId,
    timeLabel: slot.timeLabel,
    eventStart: slot.eventStart,
    eventEnd: slot.eventEnd,
  };

  await ctx.editMessageText(
    `Ваша запись на пробный урок:\n\n` +
      `<b>День:</b> ${state.dayLabel}\n` +
      `<b>Время:</b> ${slot.timeLabel}\n\n` +
      `Подтвердите запись:`,
    {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Подтвердить', 'booking_confirm')],
        [Markup.button.callback('← Назад', 'booking_back_times')],
      ]),
      parse_mode: 'HTML',
    },
  );
});

// ── Confirm booking ────────────────────────────────────────────────────────

bookingScene.action('booking_confirm', async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.from) return;

  const state = s(ctx);
  const { eventId, dayLabel = '', timeLabel = '', eventStart, eventEnd } = state;

  if (!eventId || !eventStart || !eventEnd) {
    await ctx.reply('Произошла ошибка. Начните выбор заново.');
    return ctx.scene.reenter();
  }

  const user = getUserByTelegramId(ctx.from.id);
  if (!user) {
    await ctx.reply('Пользователь не найден. Нажмите /start');
    return ctx.scene.leave();
  }

  // Create Zoom meeting for the selected slot
  let zoomLink: string | undefined;
  let zoomMeetingId: string | undefined;
  try {
    const startIso = new Date(eventStart * 1000).toISOString();
    const durationMinutes = Math.round((eventEnd - eventStart) / 60);
    const meeting = await createMeeting({
      topic: `Пробный урок — ${user.name ?? ctx.from.first_name}`,
      startTime: startIso,
      durationMinutes: durationMinutes > 0 ? durationMinutes : 60,
    });
    zoomLink = meeting.joinUrl;
    zoomMeetingId = meeting.meetingId;
  } catch (err) {
    logger.error('Zoom meeting creation failed', { err, eventId });
    // Non-fatal: continue booking without Zoom link
  }

  try {
    await bookSlot(eventId, user.name ?? ctx.from.first_name);
    createBooking({ userId: user.id, calendarEventId: eventId, eventStart, eventEnd, zoomLink, zoomMeetingId });
  } catch (err) {
    logger.error('Booking failed', { err, eventId });
    await ctx.answerCbQuery('Не удалось забронировать. Попробуйте ещё раз.');
    return;
  }

  // Cancel nudge jobs, schedule lesson reminders
  cancelNudges(ctx.from.id);
  scheduleLessonReminders(
    ctx.from.id,
    eventStart,
    eventId,
    dayLabel,
    timeLabel,
    zoomLink ?? '',
  );

  // Sync sheet row with booking data
  if (user.sheets_row) {
    const startDate = new Date(eventStart * 1000);
    const now = Math.floor(Date.now() / 1000);
    try {
      await syncUserRow(user.sheets_row, {
        lessonDate: formatDay(startDate),
        lessonTime: formatTime(startDate),
        lessonDatetime: startDate.toISOString(),
        zoomLink,
        zoomMeetingId,
        confirmed: true,
        confirmedAt: now,
        calendarEventId: eventId,
        status: 'booked',
      });
    } catch (err) {
      logger.error('Sheet sync failed (booking confirm)', { err });
    }
  }

  clearState(ctx);

  const zoomLine = zoomLink ? `\n<b>Ссылка Zoom:</b> ${zoomLink}` : '';

  await ctx.editMessageText(
    `✅ Запись подтверждена!\n\n` +
      `<b>Имя:</b> ${user.name ?? ctx.from.first_name}\n` +
      (user.phone ? `<b>Телефон:</b> ${user.phone}\n` : '') +
      (user.email ? `<b>Email:</b> ${user.email}\n` : '') +
      `\n<b>День:</b> ${dayLabel}\n` +
      `<b>Время:</b> ${timeLabel}` +
      zoomLine +
      `\n\nДо встречи!`,
    { parse_mode: 'HTML' },
  );

  await sendMainMenu(ctx, 'Вы можете просмотреть свою запись:');
  return ctx.scene.leave();
});

// ── Back buttons ───────────────────────────────────────────────────────────

bookingScene.action('booking_back_days', async (ctx) => {
  await ctx.answerCbQuery();
  clearState(ctx);
  await showDaySelection(ctx);
});

bookingScene.action('booking_back_times', async (ctx) => {
  await ctx.answerCbQuery();
  const { dayKey } = s(ctx);
  ctx.scene.state = { ...s(ctx), eventId: undefined, timeLabel: undefined, eventStart: undefined, eventEnd: undefined };

  if (!dayKey) return showDaySelection(ctx);

  let slots: Map<string, CalendarSlot[]>;
  try {
    slots = await getAvailableSlots();
  } catch {
    return showDaySelection(ctx);
  }

  return showTimeSelection(ctx, dayKey, slots);
});

// ── Ignore unexpected text input ───────────────────────────────────────────

bookingScene.on('message', async (ctx) => {
  await ctx.reply('Пожалуйста, используйте кнопки для выбора.');
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function showDaySelection(ctx: BotContext): Promise<void> {
  let slots: Map<string, CalendarSlot[]>;
  try {
    slots = await getAvailableSlots();
  } catch (err) {
    logger.error('Calendar fetch failed on showDaySelection', { err });
    const msg = 'Не удалось загрузить расписание. Попробуйте позже.';
    ctx.callbackQuery ? await ctx.editMessageText(msg) : await ctx.reply(msg);
    await ctx.scene.leave();
    return;
  }

  if (slots.size === 0) {
    const msg = 'К сожалению, свободных слотов нет. Попробуйте позже.';
    ctx.callbackQuery ? await ctx.editMessageText(msg) : await ctx.reply(msg);
    await ctx.scene.leave();
    return;
  }

  const buttons = Array.from(slots.entries()).map(([dayKey, daySlots]) => [
    Markup.button.callback(daySlots[0]!.dayLabel, `booking_day_${dayKey}`),
  ]);

  const text = 'Выберите удобный день для пробного урока:';
  const keyboard = Markup.inlineKeyboard(buttons);

  ctx.callbackQuery
    ? await ctx.editMessageText(text, keyboard)
    : await ctx.reply(text, keyboard);
}

async function showTimeSelection(
  ctx: BotContext,
  dayKey: string,
  slots: Map<string, CalendarSlot[]>,
): Promise<void> {
  const daySlots = slots.get(dayKey);
  if (!daySlots || daySlots.length === 0) {
    return showDaySelection(ctx);
  }

  const slotMap: Record<string, string> = {};
  const timeButtons = daySlots.map((slot, i) => {
    slotMap[String(i)] = slot.eventId;
    return [Markup.button.callback(slot.timeLabel, `booking_time_${i}`)];
  });

  ctx.scene.state = { ...s(ctx), slots: slotMap, dayLabel: daySlots[0]!.dayLabel };

  await ctx.editMessageText(
    `Выберите удобное время:\n<b>${daySlots[0]!.dayLabel}</b>`,
    {
      ...Markup.inlineKeyboard([
        ...timeButtons,
        [Markup.button.callback('← Назад', 'booking_back_days')],
      ]),
      parse_mode: 'HTML',
    },
  );
}
