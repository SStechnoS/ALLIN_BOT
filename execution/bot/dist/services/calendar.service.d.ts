import type { CalendarSlot } from '../types';
declare class CalendarService {
    /**
     * Получить доступные слоты из Google Calendar.
     * Менеджер создаёт события с названием "Пробный урок" — они считаются свободными.
     * После бронирования бот переименовывает событие в "Пробный урок — Имя".
     */
    getAvailableSlots(daysAhead?: number): Promise<CalendarSlot[]>;
    /**
     * Пометить слот как занятый — переименовать событие.
     */
    markSlotBusy(eventId: string, clientName: string): Promise<void>;
    /**
     * Освободить слот — вернуть событию оригинальное название.
     */
    freeSlot(eventId: string): Promise<void>;
}
export declare const calendarService: CalendarService;
export {};
//# sourceMappingURL=calendar.service.d.ts.map