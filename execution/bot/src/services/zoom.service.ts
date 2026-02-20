import axios from 'axios'
import { config } from '../config'
import { logger } from '../logger'
import type { ZoomMeeting } from '../types'

class ZoomService {
  private tokenCache: { token: string; expiresAt: number } | null = null

  private async getToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token
    }

    const credentials = Buffer.from(
      `${config.ZOOM_CLIENT_ID}:${config.ZOOM_CLIENT_SECRET}`
    ).toString('base64')

    const res = await axios.post(
      'https://zoom.us/oauth/token',
      null,
      {
        params: { grant_type: 'account_credentials', account_id: config.ZOOM_ACCOUNT_ID },
        headers: { Authorization: `Basic ${credentials}` },
      }
    )

    // Токен живёт 1 час, кэшируем на 55 минут
    this.tokenCache = {
      token: res.data.access_token,
      expiresAt: Date.now() + 55 * 60 * 1000,
    }

    return this.tokenCache.token
  }

  async createMeeting(topic: string, startTime: string): Promise<ZoomMeeting> {
    const token = await this.getToken()

    const res = await axios.post(
      'https://api.zoom.us/v2/users/me/meetings',
      {
        topic,
        type: 2, // scheduled
        start_time: startTime,
        duration: 60,
        timezone: 'Europe/Tallinn',
        settings: {
          waiting_room: false,
          join_before_host: true,
          mute_upon_entry: false,
        },
      },
      { headers: { Authorization: `Bearer ${token}` } }
    )

    logger.info({ meetingId: res.data.id, topic }, 'Zoom meeting created')
    return res.data as ZoomMeeting
  }

  async deleteMeeting(meetingId: string): Promise<void> {
    if (!meetingId) return
    const token = await this.getToken()
    try {
      await axios.delete(`https://api.zoom.us/v2/meetings/${meetingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      logger.info({ meetingId }, 'Zoom meeting deleted')
    } catch (err: any) {
      if (err.response?.status === 404) {
        logger.warn({ meetingId }, 'Zoom meeting not found (already deleted)')
      } else {
        throw err
      }
    }
  }
}

export const zoomService = new ZoomService()
