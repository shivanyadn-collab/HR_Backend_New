import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'

export interface SendMailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
  cc?: string | string[]
  bcc?: string | string[]
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
}

export interface SendMailResult {
  success: boolean
  messageId?: string
  error?: string
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private transporter: nodemailer.Transporter

  constructor(private configService: ConfigService) {
    this.initializeTransporter()
  }

  private initializeTransporter() {
    const host = this.configService.get<string>('MAIL_HOST') || 'smtp.gmail.com'
    const port = this.configService.get<number>('MAIL_PORT') || 587
    const user = this.configService.get<string>('MAIL_USER') || 'no-reply@exozen.co.in'
    const pass = this.configService.get<string>('MAIL_PASSWORD') || ''
    const secure = this.configService.get<boolean>('MAIL_SECURE') || false

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates
      },
    })

    // Verify connection
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('Mail transporter verification failed:', error.message)
      } else {
        this.logger.log('Mail transporter is ready to send emails')
      }
    })
  }

  async sendMail(options: SendMailOptions): Promise<SendMailResult> {
    const defaultFrom = this.configService.get<string>('MAIL_FROM') || 'no-reply@exozen.co.in'
    const defaultFromName = this.configService.get<string>('MAIL_FROM_NAME') || 'HR System'

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: options.from || `"${defaultFromName}" <${defaultFrom}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
        attachments: options.attachments,
      }

      const info = await this.transporter.sendMail(mailOptions)
      this.logger.log(`Email sent successfully: ${info.messageId}`)

      return {
        success: true,
        messageId: info.messageId,
      }
    } catch (error: any) {
      this.logger.error(`Failed to send email: ${error.message}`)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  async sendBulkMails(
    recipients: string[],
    subject: string,
    html: string,
    text?: string,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0
    let failed = 0
    const errors: string[] = []

    for (const recipient of recipients) {
      const result = await this.sendMail({
        to: recipient,
        subject,
        html,
        text,
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
