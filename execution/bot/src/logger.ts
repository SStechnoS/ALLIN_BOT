import pino from 'pino'
import { config } from './config'

export const logger = pino({
  level: config.IS_PRODUCTION ? 'info' : 'debug',
  transport: config.IS_PRODUCTION ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' }
  }
})
