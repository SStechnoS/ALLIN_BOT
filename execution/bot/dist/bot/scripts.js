"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCRIPTS = void 0;
/**
 * Тексты всех сообщений Telegram-бота
 * Редактировать здесь — изменения отражаются во всём боте
 */
const config_1 = require("../config");
const ML = config_1.config.MANAGER_LINK;
// Форматирует YYYY-MM-DD → DD.MM.YYYY
function fmtDate(dateStr) {
    if (!dateStr)
        return '';
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day)
        return dateStr;
    return `${day}.${month}.${year}`;
}
exports.SCRIPTS = {
    // === WELCOME ===
    WELCOME_TEXT: 'Привет! 👋 Добро пожаловать в All In Academy.\n\n' +
        'Мы рады, что вы заботитесь о будущем вашего ребёнка.\n' +
        'Здесь вы можете записаться на бесплатный пробный урок английского.',
    GDPR_REQUEST: 'Перед тем как продолжить, нам нужно ваше согласие на обработку персональных данных.\n\n' +
        'Нажав «Продолжить», вы соглашаетесь с нашей политикой конфиденциальности.',
    GDPR_DECLINED: `Понимаем. Без согласия мы не можем записать вас на урок.\n\n` +
        `Если передумаете — просто напишите /start.\n` +
        `Или свяжитесь с нашим менеджером напрямую: ${ML}`,
    // === REGISTRATION ===
    PHONE_REQUEST: 'Укажите ваш номер телефона, чтобы мы могли с вами связаться при необходимости.',
    PHONE_INVALID: 'Пожалуйста, введите номер в формате: +37251234567\n' +
        'Или нажмите кнопку «Поделиться номером» ниже.',
    PHONE_OK: 'Отлично! ✅',
    EMAIL_REQUEST: 'Введите ваш email — туда придёт подтверждение записи и ссылка на Zoom.',
    EMAIL_INVALID: 'Кажется, email введён неверно. Попробуйте ещё раз.\nНапример: anna@example.com',
    EMAIL_OK: 'Записал! ✅',
    NAME_REQUEST: 'И последнее — как вас зовут?',
    NAME_OK: (name) => `Приятно познакомиться, ${name}! 👋\n\nТеперь выберем удобное время для пробного урока.`,
    // === DATE PICKER ===
    PICK_DATE: 'Выберите удобную дату для пробного урока:',
    PICK_TIME: (date) => `Отлично! Выберите время ${date}:`,
    CONFIRM_BOOKING: (date, time) => `Подтвердите запись:\n\n📅 ${date}\n🕐 ${time} (по Таллину)\n\nВсё верно?`,
    CREATING_ZOOM: '⏳ Создаём Zoom-встречу...',
    BOOKING_SUCCESS: (date, time, zoomLink) => `🎉 Вы записаны на пробный урок!\n\n` +
        `📅 Дата: ${date}\n🕐 Время: ${time} (по Таллину)\n📹 Zoom: ${zoomLink}\n\n` +
        `За 24 часа мы напомним вам о встрече.\n\nСохраните ссылку на Zoom — она пригодится в день урока!`,
    NO_SLOTS: `К сожалению, сейчас нет свободных слотов на ближайшие две недели.\n\n` +
        `Напишите нашему менеджеру — он поможет подобрать время:`,
    ZOOM_ERROR: `Произошла небольшая техническая ошибка 😔\n\n` +
        `Мы уже знаем об этом и скоро пришлём вам ссылку на встречу.\n` +
        `Или напишите менеджеру: ${ML}`,
    // === AI ===
    AI_ACTIVATED: `Режим консультанта включён 🤖\n\n` +
        `Я ассистент All In Academy — задайте любой вопрос о школе и обучении.\n\n` +
        `Чтобы вернуться к записи, нажмите /menu`,
    // === RETURNING USERS ===
    RETURNING_WITH_BOOKING: (lead) => `С возвращением, ${lead.name}! 👋\n\n` +
        `Ваш пробный урок уже запланирован:\n\n` +
        `📅 ${fmtDate(lead.lesson_date)}\n` +
        `🕐 ${lead.lesson_time} (по Таллину)\n` +
        (lead.zoom_link ? `📹 Zoom: ${lead.zoom_link}\n\n` : '\n') +
        `Нажмите **«📅 Моё бронирование»** чтобы посмотреть детали.\n\n` +
        `Если хотите узнать больше об академии — задайте вопрос нашему AI-ассистенту 🤖 Можно голосом!\n\n` +
        `Если нужна помощь — менеджер всегда на связи 📞`,
    RETURNING_NO_DATE: (lead) => `С возвращением, ${lead.name}! 👋\n\n` +
        `Осталось выбрать время для пробного урока — займёт буквально минуту 🙂`,
    // === SCHEDULED ===
    ALREADY_SCHEDULED: (lead) => `Вы уже записаны на пробный урок! 🎉\n\n📅 ${fmtDate(lead.lesson_date)} в ${lead.lesson_time}`,
    SCHEDULED_MENU: (lead) => `Вы записаны на пробный урок! ✅\n\n` +
        `📅 ${fmtDate(lead?.lesson_date)} в ${lead?.lesson_time}\n📹 ${lead?.zoom_link}\n\nЧем могу помочь?`,
    // === CONFIRMATIONS ===
    CONFIRMATION_SUCCESS: (lead) => `Отлично! Ждём вас 🎓\n\nНе забудьте:\n• Включить камеру и микрофон\n• Зайти по ссылке Zoom заранее (за 5 минут)\n\nДо встречи!`,
    RESCHEDULE_RESPONSE: `Понимаем! Для переноса свяжитесь с нашим менеджером:\n${ML}\n\nОн поможет выбрать другое удобное время.`,
    // === STATUS ===
    STATUS_NO_BOOKING: `У вас пока нет активной записи.\n\nНажмите /start чтобы записаться на бесплатный пробный урок.`,
    STATUS_SCHEDULED: (lead) => `Ваша запись:\n\n📅 ${fmtDate(lead.lesson_date)}\n🕐 ${lead.lesson_time} (по Таллину)\n📹 ${lead.zoom_link}\n✅ Статус: Запланирован`,
    STATUS_CONFIRMED: (lead) => `Ваша запись:\n\n📅 ${fmtDate(lead.lesson_date)}\n🕐 ${lead.lesson_time} (по Таллину)\n📹 ${lead.zoom_link}\n✅ Статус: Подтверждён`,
    // === HELP ===
    HELP: `Помощь All In Academy Bot\n\nКоманды:\n/start — начать сначала\n/ai — задать вопрос AI-ассистенту\n/status — ваша запись\n/menu — главное меню\n\nПо всем вопросам — менеджер:\n${ML}\n\nСайт: https://allinacademy.ee`,
    // === ERRORS ===
    UNKNOWN_MESSAGE: `Не совсем понял вас 😊\n\nИспользуйте /start для записи на урок или /ai чтобы задать вопрос нашему ассистенту.`,
    ERROR_GENERIC: `Что-то пошло не так. Попробуйте /start или напишите менеджеру: ${ML}`,
};
//# sourceMappingURL=scripts.js.map