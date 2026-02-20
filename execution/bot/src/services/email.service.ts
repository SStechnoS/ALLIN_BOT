import { Resend } from 'resend'
import { config } from '../config'
import { logger } from '../logger'

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

  // Email #1: перейди в бот (30 мин после Tilda)
  async sendEmail1(to: string, name: string): Promise<void> {
    const subject = 'Ваша заявка принята — выберите удобное время 📅'
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Привет, ${name}!</h2>
        <p>Спасибо, что заполнили заявку на пробный урок в <strong>All In Academy</strong> 🎉</p>
        <p>Всё готово с нашей стороны — осталось выбрать удобное время для урока.</p>
        <p>Это займёт всего 1 минуту:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${config.BOT_LINK}" style="background-color: #4F46E5; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px;">
            Выбрать время →
          </a>
        </p>
        <p>В нашем Telegram-боте вы:</p>
        <ul>
          <li>✅ Выберете удобную дату и время</li>
          <li>✅ Получите ссылку на Zoom-встречу</li>
          <li>✅ Узнаете всё о пробном уроке</li>
        </ul>
        <p>Пробный урок — <strong>бесплатно</strong>, без обязательств.</p>
        <br>
        <p>С уважением,<br>Команда All In Academy</p>
        <p><a href="https://allinacademy.ee">allinacademy.ee</a></p>
      </div>
    `
    await this.send(to, subject, html)
  }

  // Email #2: финальное напоминание (24ч после email1)
  async sendEmail2(to: string, name: string): Promise<void> {
    const subject = 'Напоминаем — мы зарезервировали для вас место 🎓'
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Привет, ${name}!</h2>
        <p>Вы заполнили заявку на пробный урок в All In Academy, но ещё не выбрали время.</p>
        <p>Мы хотим убедиться, что вы не потеряли письмо и всё в порядке 😊</p>
        <p>Пробный урок — это бесплатная диагностика уровня ребёнка в живом разговоре с преподавателем-носителем языка. Никакого стресса, просто общение.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${config.BOT_LINK}" style="background-color: #4F46E5; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px;">
            Записаться →
          </a>
        </p>
        <p>Если у вас есть вопросы — наш менеджер готов ответить: <a href="${config.MANAGER_LINK}">${config.MANAGER_USERNAME}</a></p>
        <br>
        <p>С уважением,<br>Команда All In Academy</p>
      </div>
    `
    await this.send(to, subject, html)
  }
}

export const emailService = new EmailService()
