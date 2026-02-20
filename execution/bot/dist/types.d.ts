import { Context, Scenes } from 'telegraf';
export interface SessionData {
    phone?: string;
    email?: string;
    name?: string;
    gdprAccepted?: boolean;
    registrationStep?: 'phone' | 'email' | 'name' | 'date';
    leadId?: string;
    isExistingLead?: boolean;
    selectedDate?: string;
    selectedTime?: string;
    selectedCalEventId?: string;
    zoomLink?: string;
    lessonDatetime?: string;
    prevScene?: string;
}
export type BotContext = Context & Scenes.SceneContext<Scenes.SceneSessionData> & {
    session: SessionData;
};
export type LeadStatus = 'NEW' | 'BOT_ACTIVE' | 'SCHEDULED' | 'CONFIRMED' | 'RESCHEDULED' | 'CALL_NEEDED' | 'ATTENDED' | 'CANCELLED';
export interface Lead {
    id: string;
    created_at: string;
    name: string;
    phone: string;
    email: string;
    child_age: number;
    tg_id: number;
    tg_username: string;
    source: 'tilda' | 'direct_bot';
    bot_activated: boolean;
    bot_activated_at: string;
    lesson_date: string;
    lesson_time: string;
    lesson_datetime: string;
    zoom_link: string;
    zoom_meeting_id: string;
    calendar_event_id: string;
    confirmed: boolean;
    confirmed_at: string;
    email_1_sent: boolean;
    email_1_sent_at: string;
    email_2_sent: boolean;
    email_2_sent_at: string;
    gdpr_accepted: boolean;
    gdpr_accepted_at: string;
    status: LeadStatus;
    manager_notes: string;
    last_updated: string;
}
export interface EmailJobData {
    leadId: string;
    email: string;
    name: string;
    phone?: string;
}
export interface ReminderJobData {
    leadId: string;
    tgId: number;
    lessonDate: string;
    lessonTime: string;
    lessonDatetime: string;
    zoomLink: string;
    name: string;
}
export interface AbandonedFlowJobData {
    tgId: number;
}
export interface CalendarSlot {
    eventId: string;
    date: string;
    time: string;
    startDatetime: string;
    endDatetime: string;
}
export interface ZoomMeeting {
    id: number;
    join_url: string;
    start_url: string;
    password: string;
    start_time: string;
}
//# sourceMappingURL=types.d.ts.map