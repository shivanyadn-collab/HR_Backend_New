import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

export interface SendWhatsAppOptions {
  to: string
  message: string
  templateName?: string
  templateParams?: string[]
}

export interface SendWhatsAppResult {
  success: boolean
  messageId?: string
  error?: string
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name)
  private readonly provider: string
  private readonly apiKey: string
  private readonly phoneNumberId: string
  private readonly businessAccountId: string
  private readonly baseUrl: string

  constructor(private configService: ConfigService) {
    this.provider = this.configService.get<string>('WHATSAPP_PROVIDER') || 'meta'
    this.apiKey = this.configService.get<string>('WHATSAPP_API_KEY') || ''
    this.phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') || ''
    this.businessAccountId = this.configService.get<string>('WHATSAPP_BUSINESS_ACCOUNT_ID') || ''

    // Set base URL based on provider
    switch (this.provider.toLowerCase()) {
      case 'meta':
        this.baseUrl = 'https://graph.facebook.com/v18.0'
        break
      case 'twilio':
        this.baseUrl = 'https://api.twilio.com/2010-04-01'
        break
      case 'gupshup':
        this.baseUrl = 'https://api.gupshup.io/sm/api/v1'
        break
      case 'wati':
        this.baseUrl = this.configService.get<string>('WATI_API_ENDPOINT') || 'https://live-server.wati.io'
        break
      default:
        this.baseUrl = 'https://graph.facebook.com/v18.0'
    }

    if (!this.apiKey) {
      this.logger.warn('WhatsApp API key not configured. WhatsApp sending will fail.')
    } else {
      this.logger.log(`WhatsApp service initialized with provider: ${this.provider}`)
    }
  }

  async sendWhatsApp(options: SendWhatsAppOptions): Promise<SendWhatsAppResult> {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'WhatsApp API key not configured',
      }
    }

    try {
      switch (this.provider.toLowerCase()) {
        case 'meta':
          return await this.sendViaMeta(options)
        case 'twilio':
          return await this.sendViaTwilio(options)
        case 'gupshup':
          return await this.sendViaGupshup(options)
        case 'wati':
          return await this.sendViaWati(options)
        default:
          return await this.sendViaMeta(options)
      }
    } catch (error: any) {
      this.logger.error(`Failed to send WhatsApp message: ${error.message}`)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Send WhatsApp via Meta (Facebook) Business API
   * Requires: WhatsApp Business Account, Phone Number ID, Access Token
   */
  private async sendViaMeta(options: SendWhatsAppOptions): Promise<SendWhatsAppResult> {
    try {
      const formattedNumber = this.formatPhoneNumber(options.to)

      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedNumber,
      }

      if (options.templateName) {
        // Send template message (required for initiating conversations)
        payload.type = 'template'
        payload.template = {
          name: options.templateName,
          language: { code: 'en' },
        }
        if (options.templateParams && options.templateParams.length > 0) {
          payload.template.components = [
            {
              type: 'body',
              parameters: options.templateParams.map((param) => ({
                type: 'text',
                text: param,
              })),
            },
          ]
        }
      } else {
        // Send text message (only works within 24-hour window)
        payload.type = 'text'
        payload.text = {
          preview_url: false,
          body: options.message,
        }
      }

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (response.data?.messages?.[0]?.id) {
        this.logger.log(`WhatsApp sent via Meta to ${formattedNumber}`)
        return {
          success: true,
          messageId: response.data.messages[0].id,
        }
      } else {
        throw new Error('No message ID in response')
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message
      this.logger.error(`Meta WhatsApp error: ${errorMessage}`)
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Send WhatsApp via Twilio
   */
  private async sendViaTwilio(options: SendWhatsAppOptions): Promise<SendWhatsAppResult> {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID')
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN')
    const fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER')

    if (!accountSid || !authToken || !fromNumber) {
      return {
        success: false,
        error: 'Twilio credentials not configured',
      }
    }

    try {
      const formattedNumber = this.formatPhoneNumber(options.to)

      const response = await axios.post(
        `${this.baseUrl}/Accounts/${accountSid}/Messages.json`,
        new URLSearchParams({
          To: `whatsapp:+${formattedNumber}`,
          From: `whatsapp:${fromNumber}`,
          Body: options.message,
        }),
        {
          auth: {
            username: accountSid,
            password: authToken,
          },
        }
      )

      if (response.data.sid) {
        this.logger.log(`WhatsApp sent via Twilio to ${formattedNumber}`)
        return {
          success: true,
          messageId: response.data.sid,
        }
      } else {
        throw new Error('No message SID in response')
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message
      this.logger.error(`Twilio WhatsApp error: ${errorMessage}`)
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Send WhatsApp via Gupshup
   */
  private async sendViaGupshup(options: SendWhatsAppOptions): Promise<SendWhatsAppResult> {
    const sourceNumber = this.configService.get<string>('GUPSHUP_SOURCE_NUMBER')
    const appName = this.configService.get<string>('GUPSHUP_APP_NAME')

    if (!sourceNumber || !appName) {
      return {
        success: false,
        error: 'Gupshup credentials not configured',
      }
    }

    try {
      const formattedNumber = this.formatPhoneNumber(options.to)

      const response = await axios.post(
        `${this.baseUrl}/msg`,
        new URLSearchParams({
          channel: 'whatsapp',
          source: sourceNumber,
          destination: formattedNumber,
          message: JSON.stringify({ type: 'text', text: options.message }),
          'src.name': appName,
        }),
        {
          headers: {
            apikey: this.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )

      if (response.data.status === 'submitted') {
        this.logger.log(`WhatsApp sent via Gupshup to ${formattedNumber}`)
        return {
          success: true,
          messageId: response.data.messageId,
        }
      } else {
        throw new Error(response.data.message || 'Unknown error')
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message
      this.logger.error(`Gupshup WhatsApp error: ${errorMessage}`)
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Send WhatsApp via WATI (WhatsApp Team Inbox)
   * Popular in India, easy setup
   */
  private async sendViaWati(options: SendWhatsAppOptions): Promise<SendWhatsAppResult> {
    try {
      const formattedNumber = this.formatPhoneNumber(options.to)

      let endpoint: string
      let payload: any

      if (options.templateName) {
        // Send template message
        endpoint = `${this.baseUrl}/api/v1/sendTemplateMessage`
        payload = {
          whatsappNumber: formattedNumber,
          template_name: options.templateName,
          broadcast_name: 'HR_Notification',
          parameters: options.templateParams?.map((param, index) => ({
            name: `${index + 1}`,
            value: param,
          })) || [],
        }
      } else {
        // Send session message
        endpoint = `${this.baseUrl}/api/v1/sendSessionMessage/${formattedNumber}`
        payload = {
          messageText: options.message,
        }
      }

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.data.result) {
        this.logger.log(`WhatsApp sent via WATI to ${formattedNumber}`)
        return {
          success: true,
          messageId: response.data.info?.id || 'wati-sent',
        }
      } else {
        throw new Error(response.data.info || 'Unknown error')
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.info || error.message
      this.logger.error(`WATI WhatsApp error: ${errorMessage}`)
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Send WhatsApp to multiple recipients
   */
  async sendBulkWhatsApp(
    recipients: string[],
    message: string,
    templateName?: string,
    templateParams?: string[],
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0
    let failed = 0
    const errors: string[] = []

    for (const recipient of recipients) {
      const result = await this.sendWhatsApp({
        to: recipient,
        message,
        templateName,
        templateParams,
      })

      if (result.success) {
        success++
      } else {
        failed++
        errors.push(`${recipient}: ${result.error}`)
      }

      // Small delay to avoid rate limiting
      await this.delay(100)
    }

    return { success, failed, errors }
  }

  /**
   * Format phone number with country code
   */
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '')

    // Remove leading zeros
    cleaned = cleaned.replace(/^0+/, '')

    // For India, ensure it starts with 91
    if (cleaned.length === 10) {
      cleaned = `91${cleaned}`
    }

    return cleaned
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
