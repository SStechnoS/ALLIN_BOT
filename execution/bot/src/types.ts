import { Context, Scenes } from 'telegraf'

// Данные сессии бота
export interface SessionData {
  // Регистрация
  phone?: string
  email?: string
  name?: string
  gdprAccepted?: boolean
  registrationStep?: 'phone' | 'email' | 'name' | 'date'

  // Лид
  leadId?: string
  isExistingLead?: boolean

  // Дата урока
  selectedDate?: string         // "2026-02-25"
  selectedTime?: string         // "15:00"
  selectedCalEventId?: string   // Google Calendar event ID

  // После записи
  zoomLink?: string
  lessonDatetime?: string       // ISO 8601 UTC

  // AI режим
  prevScene?: string
}

export type BotContext = Context & Scenes.SceneContext<Scenes.SceneSessionData> & {
  session: SessionData
}

// Статусы лида
export type LeadStatus =
  | 'NEW'
  | 'BOT_ACTIVE'
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'RESCHEDULED'
  | 'CALL_NEEDED'
  | 'ATTENDED'
  | 'CANCELLED'

// Модель лида (Google Sheets row)
export interface Lead {
  id: string
  created_at: string
  name: string
  phone: string
  email: string
  child_age: number
  tg_id: number
  tg_username: string
  source: 'tilda' | 'direct_bot'
  bot_activated: boolean
  bot_activated_at: string
  lesson_date: string
  lesson_time: string
  lesson_datetime: string
  zoom_link: string
  zoom_meeting_id: string
  calendar_event_id: string
  confirmed: boolean
  confirmed_at: string
  email_1_sent: boolean
  email_1_sent_at: string
  email_2_sent: boolean
  email_2_sent_at: string
  gdpr_accepted: boolean
  gdpr_accepted_at: string
  status: LeadStatus
  manager_notes: string
  last_updated: string
}

// BullMQ Job данные
export interface EmailJobData {
  leadId: string
  email: string
  name: string
  phone?: string
}

export interface ReminderJobData {
  leadId: string
  tgId: number
  lessonDate: string
  lessonTime: string
  lessonDatetime: string
  zoomLink: string
  name: string
}

export interface AbandonedFlowJobData {
  tgId: number
}

// Google Calendar slot
export interface CalendarSlot {
  eventId: string
  date: string      // "2026-02-25"
  time: string      // "15:00"
  startDatetime: string
  endDatetime: string
}

// Zoom meeting result
export interface ZoomMeeting {
  id: number
  join_url: string
  start_url: string
  password: string
  start_time: string
}
