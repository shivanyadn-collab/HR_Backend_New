import { Injectable, Logger } from '@nestjs/common'
import * as admin from 'firebase-admin'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name)
  private firebaseApp: admin.app.App

  constructor(private configService: ConfigService) {
    this.initializeFirebase()
  }

  private initializeFirebase() {
    try {
      // Initialize Firebase Admin SDK
      // You can use either service account JSON or environment variables
      const serviceAccount = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT')
      
      if (serviceAccount) {
        // If service account is provided as JSON string
        const serviceAccountJson = JSON.parse(serviceAccount)
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccountJson),
        })
      } else {
        // Try to use default credentials (for Google Cloud environments)
        // Or use environment variables
        const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID')
        const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n')
        const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL')

        if (projectId && privateKey && clientEmail) {
          this.firebaseApp = admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              privateKey,
              clientEmail,
            }),
          })
        } else {
          // Use default credentials (for Google Cloud environments)
          this.firebaseApp = admin.initializeApp()
        }
      }

      this.logger.log('Firebase Admin SDK initialized successfully')
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error)
      throw error
    }
  }

  /**
   * Send FCM notification to a single device
   */
  async sendToDevice(token: string, notification: { title: string; body: string }, data?: any): Promise<string> {
    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: data ? this.convertDataToString(data) : undefined,
        android: {
          priority: 'high' as const,
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      }

      const response = await admin.messaging().send(message)
      this.logger.log(`Successfully sent message to device: ${response}`)
      return response
    } catch (error: any) {
      this.logger.error(`Error sending message to device: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Send FCM notification to multiple devices
   */
  async sendToDevices(
    tokens: string[],
    notification: { title: string; body: string },
    data?: any,
  ): Promise<admin.messaging.BatchResponse> {
    try {
      if (tokens.length === 0) {
        throw new Error('No tokens provided')
      }

      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: data ? this.convertDataToString(data) : undefined,
        android: {
          priority: 'high' as const,
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      }

      const response = await admin.messaging().sendEachForMulticast(message)
      this.logger.log(`Successfully sent ${response.successCount} messages, ${response.failureCount} failed`)
      return response
    } catch (error: any) {
      this.logger.error(`Error sending messages to devices: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Send FCM notification to a topic
   */
  async sendToTopic(
    topic: string,
    notification: { title: string; body: string },
    data?: any,
  ): Promise<string> {
    try {
      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: data ? this.convertDataToString(data) : undefined,
        android: {
          priority: 'high' as const,
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      }

      const response = await admin.messaging().send(message)
      this.logger.log(`Successfully sent message to topic ${topic}: ${response}`)
      return response
    } catch (error: any) {
      this.logger.error(`Error sending message to topic: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Subscribe device tokens to a topic
   */
  async subscribeToTopic(tokens: string[], topic: string): Promise<void> {
    try {
      const response = await admin.messaging().subscribeToTopic(tokens, topic)
      this.logger.log(`Subscribed ${response.successCount} tokens to topic ${topic}`)
      if (response.failureCount > 0) {
        this.logger.warn(`Failed to subscribe ${response.failureCount} tokens`)
      }
    } catch (error: any) {
      this.logger.error(`Error subscribing to topic: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Unsubscribe device tokens from a topic
   */
  async unsubscribeFromTopic(tokens: string[], topic: string): Promise<void> {
    try {
      const response = await admin.messaging().unsubscribeFromTopic(tokens, topic)
      this.logger.log(`Unsubscribed ${response.successCount} tokens from topic ${topic}`)
      if (response.failureCount > 0) {
        this.logger.warn(`Failed to unsubscribe ${response.failureCount} tokens`)
      }
    } catch (error: any) {
      this.logger.error(`Error unsubscribing from topic: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Convert data object to string format (FCM requires string values)
   */
  private convertDataToString(data: any): { [key: string]: string } {
    const result: { [key: string]: string } = {}
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        result[key] = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key])
      }
    }
    return result
  }

  /**
   * Validate FCM token
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      // Try to send a test message (dry run)
      await admin.messaging().send(
        {
          token,
          notification: {
            title: 'Test',
            body: 'Test',
          },
        },
        true, // dry run
      )
      return true
    } catch (error: any) {
      if (error.code === 'messaging/invalid-registration-token' || error.code === 'messaging/registration-token-not-registered') {
        return false
      }
      // Other errors might be temporary, consider token as valid
      return true
    }
  }
}
