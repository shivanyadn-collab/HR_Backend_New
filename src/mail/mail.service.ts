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
    const port = parseInt(this.configService.get<string>('MAIL_PORT') || '587', 10)
    const user = this.configService.get<string>('MAIL_USER') || ''
    const pass = this.configService.get<string>('MAIL_PASSWORD') || ''
    const secureStr = this.configService.get<string>('MAIL_SECURE') || 'false'
    const secure = secureStr === 'true' || port === 465

    this.logger.log(`Initializing mail transporter: host=${host}, port=${port}, secure=${secure}, user=${user}`)

    // For port 587, use STARTTLS (secure=false but TLS is upgraded)
    // For port 465, use direct SSL (secure=true)
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure, // true for 465, false for 587 (STARTTLS)
      auth: {
        user,
        pass,
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false,
      },
      // Increase timeout for slow connections
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    })

    // Verify connection (non-blocking)
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('Mail transporter verification failed:', error.message)
        this.logger.warn('Emails may fail to send. Check SMTP configuration.')
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
