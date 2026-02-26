import { Resend } from 'resend'
import { config } from '../config'
import { logger } from '../logger'
import { getSetting } from '../admin/settings'

const resend = new Resend(config.RESEND_API_KEY)

class EmailService {

  private async send(to: string, subject: string, html: string): Promise<void> {
    const { error } = await resend.emails.send({
      from: `${config.RESEND_FROM_NAME} <${config.RESEND_FROM_EMAIL}>`,
      to,
      subject,
      html,
    })

    if (error) {
      logger.error({ error, to, subject }, 'Email send failed')
      throw error
    }

    logger.info({ to, subject }, 'Email sent')
  }

  private wrapCustomText(text: string): string {
    return text.split('\n').map(line => `<p style="font-size:16px;line-height:1.6;">${line}</p>`).join('')
  }

  // Email #1: перейди в бот (30 мин после Tilda)
  async sendEmail1(to: string, name: string): Promise<void> {
    const subject = `${name}, ваш пробный урок ждёт — выберите время 🎓`
    const customText = getSetting('email1_text')
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">All In Academy</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0;">Английский с native speakers</p>
        </div>

        <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="font-size: 22px; margin-top: 0;">Привет, ${name}! 👋</h2>

          ${customText ? this.wrapCustomText(customText.replace(/\$\{name\}/g, name)) : `
          <p style="font-size: 16px; line-height: 1.6;">
            Ваша заявка получена. Для вашего ребёнка готов <strong>бесплатный пробный урок</strong> с преподавателем-носителем языка из США или Великобритании.
          </p>

          <p style="font-size: 16px; line-height: 1.6;">
            На первом уроке ребёнок <em>сразу начнёт говорить</em> — это живая диагностика уровня в формате разговора, без тестов и стресса.
          </p>

          <div style="background: #F0F9FF; border-left: 4px solid #4F46E5; padding: 16px; border-radius: 4px; margin: 24px 0;">
            <p style="margin: 0; font-size: 15px; line-height: 1.6;">
              <strong>Что будет на уроке:</strong><br>
              🗣 Живое общение на английском с native speaker<br>
              📊 Понимание реального уровня ребёнка<br>
              🎯 Рекомендации что и как развивать дальше<br>
              💡 Ребёнок увидит что может говорить — это меняет всё
            </p>
          </div>
          `}

          <p style="text-align: center; margin: 32px 0;">
            <a href="${config.BOT_LINK}" style="background-color: #4F46E5; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 17px; font-weight: bold; display: inline-block;">
              Выбрать удобное время →
            </a>
          </p>

          <p style="font-size: 14px; color: #6B7280; text-align: center;">
            Слоты ограничены — группы по 4–5 человек.<br>Бесплатно. Без обязательств.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="font-size: 14px; color: #6B7280;">С уважением,<br>Команда <strong>All In Academy</strong><br><a href="https://allinacademy.ee" style="color: #4F46E5;">allinacademy.ee</a></p>
        </div>
      </div>
    `
    await this.send(to, subject, html)
  }

  // Email #2: финальное напоминание (24ч после email1)
  async sendEmail2(to: string, name: string): Promise<void> {
    const subject = `${name}, слоты заканчиваются — успейте записаться ⏰`
    const customText = getSetting('email2_text')
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">All In Academy</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0;">Английский с native speakers</p>
        </div>

        <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="font-size: 22px; margin-top: 0;">${name}, ваше место ещё свободно 🎓</h2>

          ${customText ? this.wrapCustomText(customText.replace(/\$\{name\}/g, name)) : `
          <p style="font-size: 16px; line-height: 1.6;">
            Вы оставили заявку, но ещё не выбрали время. Хотим напомнить — пока ваш слот никто не занял.
          </p>

          <div style="background: #FFF7ED; border-left: 4px solid #F59E0B; padding: 16px; border-radius: 4px; margin: 24px 0;">
            <p style="margin: 0; font-size: 15px; line-height: 1.6;">
              <strong>Почему родители записывают детей именно к нам:</strong><br><br>
              👥 Группы 4–5 человек — каждый ребёнок говорит на каждом уроке<br>
              🇺🇸 Преподаватели — носители языка, не переводчики<br>
              🎮 Учим через интересы ребёнка — дети <em>сами</em> просят продолжить<br>
              📍 Таллин, онлайн через Zoom — удобно из любой точки
            </p>
          </div>
          `}

          <p style="font-size: 16px; line-height: 1.6;">
            Пробный урок покажет больше, чем любое описание. И он бесплатный.
          </p>

          <p style="text-align: center; margin: 32px 0;">
            <a href="${config.BOT_LINK}" style="background-color: #4F46E5; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 17px; font-weight: bold; display: inline-block;">
              Записаться на пробный урок →
            </a>
          </p>

          <p style="font-size: 15px; line-height: 1.6; color: #374151;">
            Если есть вопросы — напишите менеджеру напрямую:<br>
            <a href="${config.MANAGER_LINK}" style="color: #4F46E5;">${config.MANAGER_USERNAME}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="font-size: 14px; color: #6B7280;">С уважением,<br>Команда <strong>All In Academy</strong><br><a href="https://allinacademy.ee" style="color: #4F46E5;">allinacademy.ee</a></p>
        </div>
      </div>
    `
    await this.send(to, subject, html)
  }
}

export const emailService = new EmailService()
