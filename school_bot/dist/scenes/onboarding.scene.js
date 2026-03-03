"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingScene = exports.SCENE_ONBOARDING = void 0;
const telegraf_1 = require("telegraf");
const config_1 = require("../config");
const bot_messages_service_1 = require("../services/bot-messages.service");
const user_service_1 = require("../services/user.service");
const sheets_service_1 = require("../services/sheets.service");
const notifications_1 = require("../jobs/notifications");
const logger_1 = require("../logger");
exports.SCENE_ONBOARDING = "onboarding";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function s(ctx) {
    return ctx.scene.state;
}
// ────────────────────────────────────────────────────────────────────────────
exports.onboardingScene = new telegraf_1.Scenes.BaseScene(exports.SCENE_ONBOARDING);
// Enter: create/get DB user immediately so we have a real userId from the start
exports.onboardingScene.enter(async (ctx) => {
    ctx.scene.state = { step: 0 };
    if (ctx.from) {
        const now = Math.floor(Date.now() / 1000);
        // Always create or refresh the minimal user record first
        let user;
        try {
            user = (0, user_service_1.createOrGetUser)(ctx.from.id, ctx.from.username ?? null);
            s(ctx).userId = user.id;
        }
        catch (err) {
            logger_1.logger.error("createOrGetUser failed on onboarding enter", { err });
        }
        if (user) {
            if (user.sheets_row) {
                // Row already exists (re-entry) — store it and refresh tg data
                s(ctx).sheetsRow = user.sheets_row;
                try {
                    await (0, sheets_service_1.syncUserRow)(user.sheets_row, {
                        tgId: ctx.from.id,
                        tgUsername: ctx.from.username ?? ctx.from.first_name,
                        botActivated: true,
                        botActivatedAt: now,
                    });
                }
                catch (err) {
                    logger_1.logger.error("Sheet sync failed on onboarding re-enter", { err });
                }
            }
            else {
                // First time — append a new row with userId already filled in
                try {
                    const sheetsRow = await (0, sheets_service_1.appendUserRow)({
                        userId: user.id,
                        tgId: ctx.from.id,
                        tgUsername: ctx.from.username ?? ctx.from.first_name,
                        botActivated: true,
                        botActivatedAt: now,
                        createdAt: now,
                        source: "telegram_bot",
                        status: "new",
                    });
                    s(ctx).sheetsRow = sheetsRow;
                    (0, user_service_1.updateUserSheetsRow)(user.id, sheetsRow);
                    (0, notifications_1.scheduleNudges)(ctx.from.id, now);
                }
                catch (err) {
                    logger_1.logger.error("Failed to append sheet row on onboarding enter", {
                        err,
                    });
                }
            }
        }
    }
    const welcomeText = (0, bot_messages_service_1.getBotMessage)("welcome_text");
    const videoNoteId = (0, bot_messages_service_1.getBotMessage)("welcome_video_note_id");
    // 1) Отдельно отправляем приветственное сообщение
    await ctx.reply(welcomeText);
    // 2) video note
    if (videoNoteId && ctx.chat) {
        try {
            await ctx.telegram.sendVideoNote(ctx.chat.id, videoNoteId);
        }
        catch (err) {
            logger_1.logger.error("Failed to send welcome video note", { err });
        }
    }
    // 3) Отдельным сообщением — запрос на подтверждение политики
    await ctx.reply("🔐 Для продолжения необходимо принять политику конфиденциальности.\n\nМы храним ваши данные безопасно и не передаём третьим лицам.", telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback("✅ Принимаю", "onboarding_consent"),
            telegraf_1.Markup.button.url("📄 Политика конфиденциальности", config_1.config.privacyPolicyUrl),
        ],
    ]));
});
// Step 0 → 1: user accepted consent
exports.onboardingScene.action("onboarding_consent", async (ctx) => {
    if (s(ctx).step !== 0)
        return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    ctx.scene.state = { ...s(ctx), step: 1 };
    await ctx.reply("🎉 Отлично, вы нас приняли!\n\n📱 Теперь поделитесь своим номером телефона — нажмите кнопку ниже:", telegraf_1.Markup.keyboard([
        [telegraf_1.Markup.button.contactRequest("📱 Отправить номер телефона")],
    ])
        .resize()
        .oneTime());
});
// /start while in onboarding — re-show welcome + re-prompt the last unanswered step.
// Registered before on('message') so it takes priority.
exports.onboardingScene.command("start", async (ctx) => {
    const state = s(ctx);
    const welcomeText = (0, bot_messages_service_1.getBotMessage)("welcome_text");
    const videoNoteId = (0, bot_messages_service_1.getBotMessage)("welcome_video_note_id");
    if (videoNoteId && ctx.chat) {
        try {
            await ctx.telegram.sendVideoNote(ctx.chat.id, videoNoteId);
        }
        catch { }
    }
    if (state.step === 0) {
        // Ещё не подтвердили согласие — повторно отправляем welcome и отдельное сообщение с политикой
        await ctx.reply(welcomeText);
        await ctx.reply("🔐 Для продолжения необходимо принять политику конфиденциальности.\n\nМы храним ваши данные безопасно и не передаём третьим лицам.", telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback("✅ Принимаю", "onboarding_consent"),
                telegraf_1.Markup.button.url("📄 Политика конфиденциальности", config_1.config.privacyPolicyUrl),
            ],
        ]));
    }
    else {
        // Уже после согласия — просто повторно отправляем welcome и подсказываем текущий шаг
        await ctx.reply(welcomeText);
        if (state.step === 1) {
            await ctx.reply("📱 Поделитесь своим номером телефона — нажмите кнопку ниже:", telegraf_1.Markup.keyboard([
                [telegraf_1.Markup.button.contactRequest("📱 Отправить номер телефона")],
            ])
                .resize()
                .oneTime());
        }
        else if (state.step === 2) {
            await ctx.reply("📧 Введите вашу электронную почту:", telegraf_1.Markup.removeKeyboard());
        }
        else if (state.step === 3) {
            await ctx.reply("✍️ Введите ваше имя:");
        }
    }
});
// Message handler: drives steps 1 → 2 → 3 → done
exports.onboardingScene.on("message", async (ctx) => {
    const state = s(ctx);
    // Step 0: waiting for consent — remind user
    if (state.step === 0) {
        await ctx.reply("👆 Нажмите кнопку «✅ Принимаю» выше, чтобы продолжить.");
        return;
    }
    // Step 1: waiting for phone contact
    if (state.step === 1) {
        if (!("contact" in ctx.message)) {
            await ctx.reply("📱 Используйте кнопку ниже, чтобы поделиться номером телефона.");
            return;
        }
        const phone = ctx.message.contact.phone_number;
        ctx.scene.state = { ...state, step: 2, phone };
        if (state.sheetsRow) {
            try {
                await (0, sheets_service_1.syncUserRow)(state.sheetsRow, { phone });
            }
            catch (err) {
                logger_1.logger.error("Sheet sync failed (phone)", { err });
            }
        }
        await ctx.reply("📧 Отлично! Теперь введите вашу электронную почту:", telegraf_1.Markup.removeKeyboard());
        return;
    }
    // Step 2: waiting for email
    if (state.step === 2) {
        if (!("text" in ctx.message))
            return;
        const email = ctx.message.text.trim();
        if (!EMAIL_RE.test(email)) {
            await ctx.reply("❌ Неверный формат email. Попробуйте ещё раз:\n\nПример: <code>name@example.com</code>", { parse_mode: "HTML" });
            return;
        }
        ctx.scene.state = { ...state, step: 3, email };
        if (state.sheetsRow) {
            try {
                await (0, sheets_service_1.syncUserRow)(state.sheetsRow, { email });
            }
            catch (err) {
                logger_1.logger.error("Sheet sync failed (email)", { err });
            }
        }
        await ctx.reply("✍️ Почти готово! Введите ваше имя:");
        return;
    }
    // Step 3: waiting for name → finalize user → sync sheet → enter booking
    if (state.step === 3) {
        if (!("text" in ctx.message) || !ctx.from)
            return;
        const name = ctx.message.text.trim();
        if (!name) {
            await ctx.reply("✍️ Пожалуйста, введите ваше имя:");
            return;
        }
        if (!state.userId) {
            await ctx.reply("⚠️ Что-то пошло не так. Попробуйте ещё раз.");
            return ctx.scene.reenter();
        }
        try {
            (0, user_service_1.finalizeUser)(state.userId, {
                phone: state.phone ?? null,
                email: state.email ?? null,
                name,
            });
        }
        catch (err) {
            logger_1.logger.error("Failed to finalize user during onboarding", { err });
            await ctx.reply("⚠️ Произошла ошибка. Попробуйте ещё раз.");
            return;
        }
        if (state.sheetsRow) {
            const now = Math.floor(Date.now() / 1000);
            try {
                await (0, sheets_service_1.syncUserRow)(state.sheetsRow, {
                    name,
                    gdprAccepted: true,
                    gdprAcceptedAt: now,
                    status: "registered",
                });
            }
            catch (err) {
                logger_1.logger.error("Sheet sync failed (name/gdpr)", { err });
            }
        }
        await ctx.reply(`🎯 Отлично, ${name}! Все данные сохранены.\n\nТеперь выберем удобное время для вашего <b>пробного пробного урока</b> 📅`, { parse_mode: "HTML" });
        return ctx.scene.enter("booking");
    }
});
//# sourceMappingURL=onboarding.scene.js.map