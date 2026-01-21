import { Injectable, Logger } from '@nestjs/common'
import * as admin from 'firebase-admin'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name)
  private firebaseApp: admin.app.App | null = null

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
        try {
          const serviceAccountJson = JSON.parse(serviceAccount)
          this.firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccountJson),
          })
          this.logger.log('Firebase Admin SDK initialized successfully using FIREBASE_SERVICE_ACCOUNT')
          return
        } catch (parseError) {
          this.logger.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON, trying alternative methods', parseError)
        }
      }

      // Try to use environment variables
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID')
      let privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY')
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL')

      if (projectId && privateKey && clientEmail) {
        // Fix private key formatting - ensure proper PEM format
        privateKey = privateKey.replace(/\\n/g, '\n')
        
        // Validate that private key has proper PEM headers
        if (!privateKey.includes('-----BEGIN')) {
          this.logger.warn('FIREBASE_PRIVATE_KEY appears to be missing PEM headers. Ensure it includes -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----')
        }

        // Validate private key is not empty after processing
        if (!privateKey.trim()) {
          this.logger.warn('FIREBASE_PRIVATE_KEY is empty after processing')
          this.tryDefaultInitialization()
          return
        }

        try {
          this.firebaseApp = admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              privateKey,
              clientEmail,
            }),
          })
          this.logger.log('Firebase Admin SDK initialized successfully using environment variables')
          return
        } catch (certError) {
          this.logger.error('Failed to initialize Firebase with provided credentials', certError)
          this.tryDefaultInitialization()
          return
        }
      } else {
        this.logger.warn('Firebase credentials not found in environment variables. Missing: ' + 
          (!projectId ? 'FIREBASE_PROJECT_ID ' : '') +
          (!privateKey ? 'FIREBASE_PRIVATE_KEY ' : '') +
          (!clientEmail ? 'FIREBASE_CLIENT_EMAIL' : ''))
        this.tryDefaultInitialization()
      }
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error)
      this.logger.warn('Application will continue without Firebase. Push notifications will not work.')
      // Don't throw error - allow app to start without Firebase
    }
  }

  private tryDefaultInitialization() {
    try {
      // Use default credentials (for Google Cloud environments)
      this.firebaseApp = admin.initializeApp()
      this.logger.log('Firebase Admin SDK initialized using default credentials')
    } catch (defaultError) {
      this.logger.warn('Failed to initialize Firebase with default credentials. Push notifications will be disabled.', defaultError)
      this.firebaseApp = null
    }
  }

  private ensureInitialized(): void {
    if (!this.firebaseApp) {
      throw new Error('Firebase Admin SDK is not initialized. Please check your Firebase configuration.')
    }
  }

  /**
   * Send FCM notification to a single device
   */
  async sendToDevice(token: string, notification: { title: string; body: string }, data?: any): Promise<string> {
    this.ensureInitialized()
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
    this.ensureInitialized()
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
    this.ensureInitialized()
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
    this.ensureInitialized()
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
    if (!this.firebaseApp) {
      this.logger.warn('Firebase not initialized, cannot validate token')
      return false
    }
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
