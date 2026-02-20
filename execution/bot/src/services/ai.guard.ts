import { config } from '../config'

const PRICE_KEYWORDS = [
  'цена', 'стоимость', 'сколько стоит', 'сколько платить', 'сколько платит',
  'тариф', 'прайс', 'оплата', 'оплатить', 'платить', 'дорого', 'дёшево',
  'price', 'cost', 'how much', 'fee', 'payment', 'expensive', 'cheap',
  'хватит денег', 'нет денег', 'бюджет', 'рассрочка', 'скидка', 'скидку',
  'акция', 'промокод', 'абонемент', 'subscription', 'сколько занятие',
]

const INDIVIDUAL_KEYWORDS = [
  'индивидуал', 'индивидуальн', 'один на один', 'one on one', 'one-on-one',
  '1 на 1', '1:1', '1в1', 'private lesson', 'private class', 'приват',
]

const INJECT_PATTERNS = [
  'игнорируй', 'ignore previous', 'ignore instructions', 'forget instructions',
  'forget your', 'system prompt', 'системный промпт', 'pretend you are',
  "pretend you're", 'roleplay as', 'act as', 'you are now', 'ты теперь',
  'jailbreak', 'dan ', ' dan,', 'забудь всё', 'new instructions',
  'новые инструкции', 'from now on', 'ты больше не', 'disregard', 'override',
]

const RESPONSE_LEAK_PATTERNS = [
  'абсолютные запреты', 'системный промпт', 'ключевые факты о школе',
  'стиль ответов', 'безопасность', 'кто ты', 'всё что ты знаешь',
  'когда направлять к менеджеру',
]

export const aiGuard = {
  get PRICE_RESPONSE() {
    return `По вопросам стоимости наш менеджер расскажет всё подробно 😊\nНапишите ему: ${config.MANAGER_LINK}`
  },

  get INDIVIDUAL_RESPONSE() {
    return (
      `Индивидуальные занятия у нас тоже есть! 🎯\n\n` +
      `Формат «один на один» стоит примерно в 4 раза дороже, чем занятие в мини-группе — ` +
      `зато всё внимание преподавателя достаётся только вашему ребёнку.\n\n` +
      `Для обсуждения деталей и записи напишите нашему менеджеру: ${config.MANAGER_LINK}`
    )
  },

  INJECT_RESPONSE: 'Я ассистент All In Academy и готов ответить на вопросы о школе и обучении. Чем могу помочь?',

  get RATE_LIMIT_RESPONSE() {
    return `Вы задали много вопросов подряд! Попробуйте через час 😊\nИли напишите менеджеру: ${config.MANAGER_LINK}`
  },

  preFilter(text: string): 'price' | 'inject' | 'individual' | 'ok' {
    const lower = text.toLowerCase()
    if (INJECT_PATTERNS.some(kw => lower.includes(kw))) return 'inject'
    if (INDIVIDUAL_KEYWORDS.some(kw => lower.includes(kw))) return 'individual'
    if (PRICE_KEYWORDS.some(kw => lower.includes(kw))) return 'price'
    return 'ok'
  },

  postFilter(response: string): string {
    const lower = response.toLowerCase()

    if (RESPONSE_LEAK_PATTERNS.some(p => lower.includes(p.toLowerCase()))) {
      return 'Я ассистент All In Academy. Чем могу помочь?'
    }

    if (/\d+\s*(€|eur|euro|\$|usd|руб|₽|рублей)/gi.test(response)) {
      return this.PRICE_RESPONSE
    }

    return response
  },

  isAITrigger(text: string, sceneId: string): boolean {
    const strictScenes = ['phone', 'email', 'name']
    if (strictScenes.includes(sceneId)) return false

    const patterns = [
      '?', 'как ', 'что такое', 'почему', 'когда', 'где',
      'расскажи', 'объясни', 'можно ли', 'есть ли', 'что делать',
      'как лучше', 'интересует', 'подходит ли', 'для кого',
      'чем отличается', 'что включает', 'tell me', 'how does',
    ]
    const lower = text.toLowerCase()
    return patterns.some(p => lower.includes(p))
  },
}
